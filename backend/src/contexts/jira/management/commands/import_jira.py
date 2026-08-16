"""Importa projetos/cards/comentários/histórico/sprints de um workspace Jira.

Backfill único (não sync contínuo). Idempotente via `JiraImportLinkModel`,
seguindo o mesmo padrão de `projects/management/commands/seed_demo.py`:
`get_or_create` pela chave natural e, se já existir, sobrescreve campos
mutáveis manualmente. Uma issue com dado inconsistente não aborta as demais
(mesmo espírito de `run_automations.py`/`publish_due_posts.py`).

Uso:
    python manage.py import_jira --workspace-slug demo-t4e
    python manage.py import_jira --workspace-slug demo-t4e --project-keys PROJ1,PROJ2 --dry-run

Credenciais via ambiente (ver .env.example): JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN.
"""
from __future__ import annotations

import environ
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import Max
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from django.utils.text import slugify

from contexts.identity.infrastructure.django.models import UserModel, WorkspaceModel
from contexts.jira.infrastructure.adf import adf_to_text
from contexts.jira.infrastructure.django.models import JiraImportLinkModel
from contexts.jira.infrastructure.jira_api import JiraClient
from contexts.jira.infrastructure.mapping import (
    map_issue_type,
    map_priority,
    map_resolution,
    map_status_category,
    status_color,
)
from contexts.projects.infrastructure.django.models import (
    CardCommentModel,
    CardHistoryModel,
    CardModel,
    ProjectModel,
    SprintModel,
    WorkflowStatusModel,
)
from shared.domain.errors import DomainError

_env = environ.Env()


def _parse_dt(value: str | None):
    if not value:
        return None
    dt = parse_datetime(value)
    if dt and timezone.is_naive(dt):
        dt = timezone.make_aware(dt)
    return dt


def _parse_date(value: str | None):
    dt = _parse_dt(value)
    return dt.date() if dt else None


def _actor_identity(actor: dict | None) -> tuple[str, str] | None:
    """(email, nome) do autor Jira. Sintetiza um e-mail estável quando o Jira
    oculta o e-mail real por privacidade, para o vínculo continuar idempotente."""
    if not actor:
        return None
    email = (actor.get("emailAddress") or "").strip().lower()
    name = actor.get("displayName") or email or "Jira"
    if not email:
        account_id = actor.get("accountId")
        if not account_id:
            return None
        email = f"{account_id}@jira.local"
    return email, name


def _sprint_ids(fields: dict) -> list[int]:
    """Acha o custom field de Sprint (varia por instância) pelo formato do valor."""
    for key, value in fields.items():
        if not key.startswith("customfield_") or not isinstance(value, list):
            continue
        ids = [v["id"] for v in value if isinstance(v, dict) and "id" in v and "state" in v]
        if ids:
            return ids
    return []


class _Importer:
    def __init__(self, *, client: JiraClient, workspace: WorkspaceModel, story_points_field: str | None, stdout, style):
        self.client = client
        self.workspace = workspace
        self.story_points_field = story_points_field
        self.stdout = stdout
        self.style = style
        self._user_cache: dict[str, UserModel] = {}
        self._status_cache: dict[tuple, WorkflowStatusModel] = {}
        self.projects_done = 0
        self.cards_created = 0
        self.cards_updated = 0
        self.comments_created = 0
        self.history_created = 0

    # ── Projeto ──────────────────────────────────────────────────────────────
    def import_project(self, jira_project: dict) -> None:
        key = jira_project["key"]
        project, _ = ProjectModel.objects.get_or_create(
            workspace=self.workspace, key=key, defaults={"name": jira_project.get("name", key)}
        )

        sprint_by_jira_id = self._sync_sprints(project, key)

        issues = list(self._iter_issues(f'project = "{key}" ORDER BY created ASC'))
        for issue in issues:
            # Entradas novas de `_user_cache`/`_status_cache` criadas durante uma
            # tentativa que falha voltam com o rollback do savepoint, mas ficariam
            # "fantasmas" no cache em memória — precisam ser descartadas junto.
            cached_users, cached_statuses = set(self._user_cache), set(self._status_cache)
            try:
                with transaction.atomic():
                    card = self._upsert_card(project, issue, sprint_by_jira_id)
                    self._sync_comments(card, issue["key"])
                    self._sync_history(card, issue)
            except Exception as exc:  # noqa: BLE001 — uma issue ruim não pode abortar as demais
                for email in set(self._user_cache) - cached_users:
                    del self._user_cache[email]
                for cache_key in set(self._status_cache) - cached_statuses:
                    del self._status_cache[cache_key]
                self.stdout.write(self.style.WARNING(f"  · falha em {issue.get('key')}: {exc}"))

        self._link_parent_epic(project, issues)
        self.projects_done += 1
        self.stdout.write(self.style.SUCCESS(f"Projeto {key}: {len(issues)} issue(s) processada(s)."))

    def _iter_issues(self, jql: str):
        start_at = 0
        while True:
            page = self.client.search_issues(jql=jql, start_at=start_at)
            issues = page.get("issues", [])
            yield from issues
            start_at += len(issues)
            if not issues or start_at >= page.get("total", 0):
                break

    def _sync_sprints(self, project: ProjectModel, project_key: str) -> dict[int, SprintModel]:
        by_id: dict[int, SprintModel] = {}
        try:
            boards = self.client.list_boards(project_key)
        except DomainError:
            return by_id
        for board in boards:
            try:
                jira_sprints = self.client.list_sprints(board["id"])
            except DomainError:
                continue
            for js in jira_sprints:
                sprint, _ = SprintModel.objects.get_or_create(
                    project=project, name=js["name"], defaults={"status": "planned"}
                )
                sprint.status = {"active": "active", "closed": "closed"}.get(js.get("state"), "planned")
                sprint.start_date = _parse_date(js.get("startDate"))
                sprint.end_date = _parse_date(js.get("endDate") or js.get("completeDate"))
                sprint.started_at = _parse_dt(js.get("startDate"))
                sprint.completed_at = _parse_dt(js.get("completeDate"))
                sprint.save(update_fields=["status", "start_date", "end_date", "started_at", "completed_at"])
                by_id[js["id"]] = sprint
        return by_id

    # ── Status ───────────────────────────────────────────────────────────────
    def _status(self, project: ProjectModel, jira_status: dict) -> WorkflowStatusModel:
        name = jira_status.get("name", "Status")
        slug = slugify(name) or "status"
        cache_key = (project.id, slug)
        if cache_key in self._status_cache:
            return self._status_cache[cache_key]
        category_key = (jira_status.get("statusCategory") or {}).get("key")
        category = map_status_category(category_key)
        status, _ = WorkflowStatusModel.objects.get_or_create(
            project=project, slug=slug,
            defaults={"name": name, "category": category, "color": status_color(name, category)},
        )
        self._status_cache[cache_key] = status
        return status

    # ── Usuário-sombra ───────────────────────────────────────────────────────
    def _shadow_user(self, actor: dict | None) -> UserModel | None:
        identity = _actor_identity(actor)
        if identity is None:
            return None
        email, name = identity
        if email in self._user_cache:
            return self._user_cache[email]
        user, created = UserModel.objects.get_or_create(
            email=email, defaults={"full_name": name, "is_active": False, "email_verified": False}
        )
        if created:
            user.set_unusable_password()
            user.save(update_fields=["password"])
        self._user_cache[email] = user
        return user

    # ── Card ─────────────────────────────────────────────────────────────────
    def _upsert_card(self, project: ProjectModel, issue: dict, sprint_by_jira_id: dict) -> CardModel:
        fields = issue["fields"]
        status = self._status(project, fields["status"])
        assignee = self._shadow_user(fields.get("assignee"))
        reporter = self._shadow_user(fields.get("reporter"))
        ids = _sprint_ids(fields)
        sprint = sprint_by_jira_id.get(ids[-1]) if ids else None

        points = None
        if self.story_points_field:
            raw_points = fields.get(self.story_points_field)
            if isinstance(raw_points, (int, float)):
                points = int(raw_points)

        card_fields = {
            "title": (fields.get("summary") or "")[:200],
            "description": adf_to_text(fields.get("description")),
            "status": status.slug,
            "type": map_issue_type((fields.get("issuetype") or {}).get("name", "")),
            "priority": map_priority((fields.get("priority") or {}).get("name")),
            "points": points,
            "assignee": assignee,
            "reporter": reporter,
            "sprint": sprint,
            "labels": fields.get("labels") or [],
            "due_date": _parse_date(fields.get("duedate")),
            "resolution": map_resolution((fields.get("resolution") or {}).get("name")),
            "resolved_at": _parse_dt(fields.get("resolutiondate")),
        }

        link = (
            JiraImportLinkModel.objects.filter(project=project, jira_issue_id=str(issue["id"]))
            .select_related("card")
            .first()
        )
        if link:
            card = link.card
            for field, value in card_fields.items():
                setattr(card, field, value)
            card.save(update_fields=list(card_fields))
            self.cards_updated += 1
        else:
            next_number = (
                CardModel.objects.filter(project=project).aggregate(Max("number"))["number__max"] or 0
            ) + 1
            card = CardModel.objects.create(project=project, number=next_number, **card_fields)
            JiraImportLinkModel.objects.create(
                project=project, card=card, jira_issue_id=str(issue["id"]), jira_key=issue["key"]
            )
            self.cards_created += 1

        # auto_now_add/auto_now não aceitam valor no .save() — corrige por fora
        # para preservar a data real do Jira (é uma migração histórica).
        created_at = _parse_dt(fields.get("created"))
        updated_at = _parse_dt(fields.get("updated"))
        stamp_fields = {k: v for k, v in {"created_at": created_at, "updated_at": updated_at}.items() if v}
        if stamp_fields:
            CardModel.objects.filter(pk=card.pk).update(**stamp_fields)

        return card

    # ── Comentários ──────────────────────────────────────────────────────────
    def _sync_comments(self, card: CardModel, issue_key: str) -> None:
        start_at = 0
        while True:
            page = self.client.list_comments(issue_key, start_at=start_at)
            comments = page.get("comments", [])
            for comment in comments:
                self._import_comment(card, comment)
            start_at += len(comments)
            if not comments or start_at >= page.get("total", 0):
                break

    def _import_comment(self, card: CardModel, comment: dict) -> None:
        author = self._shadow_user(comment.get("author"))
        if author is None:
            return
        created_at = _parse_dt(comment.get("created"))
        if CardCommentModel.objects.filter(card=card, author=author, created_at=created_at).exists():
            return
        obj = CardCommentModel.objects.create(card=card, author=author, body=adf_to_text(comment.get("body")))
        if created_at:
            CardCommentModel.objects.filter(pk=obj.pk).update(created_at=created_at)
        self.comments_created += 1

    # ── Histórico ────────────────────────────────────────────────────────────
    def _sync_history(self, card: CardModel, issue: dict) -> None:
        histories = (issue.get("changelog") or {}).get("histories", [])
        for entry in histories:
            author = self._shadow_user(entry.get("author"))
            created_at = _parse_dt(entry.get("created"))
            for item in entry.get("items", []):
                field = (item.get("field") or "")[:40]
                if CardHistoryModel.objects.filter(card=card, field=field, created_at=created_at).exists():
                    continue
                obj = CardHistoryModel.objects.create(
                    card=card,
                    author=author,
                    field=field,
                    old_value=item.get("fromString") or "",
                    new_value=item.get("toString") or "",
                )
                if created_at:
                    CardHistoryModel.objects.filter(pk=obj.pk).update(created_at=created_at)
                self.history_created += 1

    # ── Épico / subtarefa ────────────────────────────────────────────────────
    def _link_parent_epic(self, project: ProjectModel, issues: list[dict]) -> None:
        for issue in issues:
            parent = issue["fields"].get("parent")
            if not parent:
                continue
            link = JiraImportLinkModel.objects.filter(
                project=project, jira_issue_id=str(issue["id"])
            ).first()
            parent_link = JiraImportLinkModel.objects.filter(
                project=project, jira_issue_id=str(parent["id"])
            ).first()
            if not link or not parent_link:
                continue
            is_epic = ((parent.get("fields") or {}).get("issuetype") or {}).get("name", "").lower() == "epic"
            field = "epic" if is_epic else "parent"
            card = link.card
            if getattr(card, f"{field}_id") != parent_link.card_id:
                setattr(card, field, parent_link.card)
                card.save(update_fields=[field])


class Command(BaseCommand):
    help = "Importa projetos, cards, comentários, histórico e sprints de um workspace Jira (backfill único)."

    def add_arguments(self, parser):
        parser.add_argument("--workspace-slug", required=True, help="Workspace T4E Office de destino.")
        parser.add_argument(
            "--project-keys", default="", help="Chaves Jira separadas por vírgula (padrão: todos os projetos)."
        )
        parser.add_argument("--dry-run", action="store_true", help="Não grava nada, só mostra o que seria feito.")
        parser.add_argument(
            "--story-points-field",
            default="",
            help="ID do custom field de Story Points (padrão: descoberto por nome 'Story Points').",
        )

    def handle(self, *args, **options):
        base_url = _env("JIRA_BASE_URL", default="")
        email = _env("JIRA_EMAIL", default="")
        api_token = _env("JIRA_API_TOKEN", default="")
        if not (base_url and email and api_token):
            raise CommandError(
                "Configure JIRA_BASE_URL, JIRA_EMAIL e JIRA_API_TOKEN no .env antes de rodar o importador."
            )

        try:
            workspace = WorkspaceModel.objects.get(slug=options["workspace_slug"])
        except WorkspaceModel.DoesNotExist as exc:
            raise CommandError(f"Workspace '{options['workspace_slug']}' não existe.") from exc

        dry_run = options["dry_run"]
        wanted_keys = {k.strip().upper() for k in options["project_keys"].split(",") if k.strip()}

        client = JiraClient(base_url=base_url, email=email, api_token=api_token)
        try:
            client.verify()
        except DomainError as exc:
            raise CommandError(f"Não foi possível validar as credenciais do Jira: {exc}") from exc

        story_points_field = options["story_points_field"] or client.find_field_id("Story Points")

        importer = _Importer(
            client=client,
            workspace=workspace,
            story_points_field=story_points_field,
            stdout=self.stdout,
            style=self.style,
        )

        with transaction.atomic():
            for jira_project in client.list_projects():
                key = jira_project["key"]
                if wanted_keys and key.upper() not in wanted_keys:
                    continue
                try:
                    with transaction.atomic():
                        importer.import_project(jira_project)
                except Exception as exc:  # noqa: BLE001 — um projeto ruim não pode abortar os demais
                    self.stdout.write(self.style.WARNING(f"Falha ao importar projeto {key}: {exc}"))

            if dry_run:
                self.stdout.write(self.style.WARNING("Dry-run: nada foi gravado (rollback no final)."))
                transaction.set_rollback(True)

        self.stdout.write(self.style.SUCCESS(
            f"Importação concluída: {importer.projects_done} projeto(s), "
            f"{importer.cards_created} card(s) criado(s), {importer.cards_updated} atualizado(s), "
            f"{importer.comments_created} comentário(s), {importer.history_created} linha(s) de histórico."
        ))
