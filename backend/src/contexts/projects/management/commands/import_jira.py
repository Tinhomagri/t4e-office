"""Importa projetos e cards de um Jira Cloud para dentro do T4E Office.

Isto é uma MIGRAÇÃO, não uma integração: roda quando alguém manda, lê o Jira e
grava nos nossos modelos. Não há sincronização, webhook nem volta de dados —
depois de importar, os cards são nossos e a origem deixa de importar.

Repetir a importação é seguro. Cada registro guarda a chave da origem
(`external_key`), e a segunda passada atualiza o mesmo card em vez de criar um
irmão. Isso permite importar aos poucos e corrigir o mapeamento sem limpar o
banco no meio.

Uso:
    python manage.py import_jira --workspace t4e
    python manage.py import_jira --workspace t4e --projects GES,PT --dry-run

Credencial (API token em https://id.atlassian.com/manage-profile/security/api-tokens):
    JIRA_URL=https://t4e.atlassian.net
    JIRA_EMAIL=voce@empresa.com
    JIRA_API_TOKEN=...
"""
from __future__ import annotations

import base64
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from contexts.identity.infrastructure.django.models import UserModel, WorkspaceModel
from contexts.projects.infrastructure.django.models import (
    CardCommentModel,
    CardModel,
    ProjectModel,
    SprintModel,
    WorkflowStatusModel,
)

# A v2 devolvia texto pronto, mas a Atlassian aposentou o /search dela (410
# Gone). Sobrou a v3, que entrega o corpo em ADF — daí o conversor abaixo.
API = "/rest/api/3"

# Jira nomeia o tipo em português ou inglês conforme o projeto. O que interessa
# é a intenção; o que não casa vira "chore", que é o balde neutro.
TYPE_MAP = {
    "bug": "bug",
    "erro": "bug",
    "história": "feature",
    "historia": "feature",
    "story": "feature",
    "epic": "epic",
    "épico": "epic",
    "epico": "epic",
    "tarefa": "chore",
    "task": "chore",
    "subtarefa": "chore",
    "subtask": "chore",
    "sub-tarefa": "chore",
    "função": "feature",
    "funcao": "feature",
    "melhoria": "feature",
    "improvement": "feature",
    "débito técnico": "debt",
    "spike": "spike",
}

PRIORITY_MAP = {
    "highest": "urgent",
    "high": "high",
    "medium": "medium",
    "low": "low",
    "lowest": "low",
    "muito alta": "urgent",
    "alta": "high",
    "média": "medium",
    "media": "medium",
    "baixa": "low",
    "muito baixa": "low",
}

# statusCategory é o único campo estável entre projetos: os nomes de status são
# livres (cada time inventa o seu), mas a categoria é sempre uma destas três.
CATEGORY_MAP = {"new": "todo", "indeterminate": "doing", "done": "done"}

# `resolution` e `resolved_at` são inseparáveis no nosso domínio: um sem o outro
# derruba a validação do card e, com ele, a listagem inteira do board. O Jira
# nomeia o desfecho livremente, então o que não casa vira "done" — a data já
# afirma que a coisa foi resolvida.
RESOLUTION_MAP = {
    "done": "done",
    "concluído": "done",
    "concluido": "done",
    "feito": "done",
    "pronto": "done",
    "resolvido": "done",
    "fixed": "done",
    "won't do": "wont_do",
    "wont do": "wont_do",
    "não será feito": "wont_do",
    "nao sera feito": "wont_do",
    "won't fix": "wont_do",
    "duplicate": "duplicate",
    "duplicado": "duplicate",
    "cannot reproduce": "cannot_reproduce",
    "não reproduzido": "cannot_reproduce",
    "incomplete": "incomplete",
    "incompleto": "incomplete",
}


def adf_to_text(node: Any) -> str:
    """Achata o Atlassian Document Format em texto legível.

    Não é um conversor completo de ADF — é o suficiente para o corpo do card
    não chegar como um dicionário aninhado. Preserva parágrafo, título, lista,
    citação e bloco de código; menções e anexos viram marcador de texto para a
    frase não perder o sentido.
    """
    if node is None:
        return ""
    if isinstance(node, str):
        return node
    if isinstance(node, list):
        return "".join(adf_to_text(n) for n in node)

    tipo = node.get("type")
    filhos = node.get("content", [])

    if tipo == "text":
        texto = node.get("text", "")
        for mark in node.get("marks", []):
            estilo = mark.get("type")
            if estilo == "strong":
                texto = f"**{texto}**"
            elif estilo == "em":
                texto = f"*{texto}*"
            elif estilo == "code":
                texto = f"`{texto}`"
            elif estilo == "link":
                texto = f"[{texto}]({mark.get('attrs', {}).get('href', '')})"
        return texto
    if tipo == "hardBreak":
        return "\n"
    if tipo == "mention":
        return f"@{node.get('attrs', {}).get('text', '').lstrip('@')}"
    if tipo in ("media", "mediaSingle", "mediaGroup"):
        return "[anexo no Jira]\n"
    if tipo == "rule":
        return "\n---\n"
    if tipo == "paragraph":
        return adf_to_text(filhos) + "\n\n"
    if tipo == "heading":
        nivel = node.get("attrs", {}).get("level", 1)
        return "#" * nivel + " " + adf_to_text(filhos) + "\n\n"
    if tipo == "codeBlock":
        return "```\n" + adf_to_text(filhos) + "\n```\n\n"
    if tipo == "blockquote":
        interno = adf_to_text(filhos).strip()
        return "\n".join(f"> {linha}" for linha in interno.splitlines()) + "\n\n"
    if tipo == "listItem":
        return "- " + adf_to_text(filhos).strip() + "\n"
    if tipo in ("bulletList", "orderedList"):
        return adf_to_text(filhos) + "\n"

    return adf_to_text(filhos)


class Command(BaseCommand):
    help = "Importa projetos, sprints e cards de um Jira Cloud."

    def add_arguments(self, parser) -> None:
        parser.add_argument("--workspace", required=True, help="Slug do workspace de destino")
        parser.add_argument("--projects", default="", help="Chaves separadas por vírgula (vazio = todos)")
        parser.add_argument("--dry-run", action="store_true", help="Só relata, não grava")
        parser.add_argument("--comments", action="store_true", help="Traz também os comentários")

    # ── HTTP ────────────────────────────────────────────────────────────────

    def _get(self, path: str, **params: Any) -> dict:
        url = f"{self.base}{path}"
        if params:
            url += "?" + urllib.parse.urlencode(params)
        request = urllib.request.Request(url, headers=self.headers)
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                return json.loads(response.read().decode())
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode()[:300]
            raise CommandError(f"Jira respondeu {exc.code} em {path}: {detail}") from exc

    def _search(self, jql: str, fields: list[str]) -> list[dict]:
        """Percorre todas as páginas de um JQL.

        A paginação é por cursor (`nextPageToken`): o endpoint novo não devolve
        mais `total`, então a parada é o fim do cursor, não uma contagem.
        """
        out: list[dict] = []
        token: str | None = None
        while True:
            params = {"jql": jql, "maxResults": 100, "fields": ",".join(fields)}
            if token:
                params["nextPageToken"] = token
            page = self._get(f"{API}/search/jql", **params)
            out.extend(page.get("issues", []))
            token = page.get("nextPageToken")
            if not token:
                return out

    # ── Mapeamentos ─────────────────────────────────────────────────────────

    def _user(self, person: dict | None) -> tuple[UserModel | None, str]:
        """Casa por e-mail; sem e-mail (privacidade escondida no Jira) tenta
        por nome exato. Sem conta nenhuma, devolve o nome para não perdê-lo."""
        if not person:
            return None, ""
        email = (person.get("emailAddress") or "").strip().lower()
        name = person.get("displayName") or ""
        if email and email in self.users:
            return self.users[email], ""
        by_name = self.users_by_name.get(name.strip().lower())
        if by_name:
            return by_name, ""
        return None, name

    def _resolution(self, fields: dict) -> tuple[str, Any]:
        """Devolve o par (desfecho, data) sempre coerente — os dois ou nenhum."""
        raw = fields.get("resolution") or {}
        name = (raw.get("name") or "").strip().lower()
        date = parse_datetime(fields["resolutiondate"]) if fields.get("resolutiondate") else None
        if not name and date is None:
            return "", None
        # Data sem desfecho (ou o contrário) é o que a validação recusa: se um
        # dos dois veio, o outro é completado.
        code = RESOLUTION_MAP.get(name, "done")
        if date is None:
            date = parse_datetime(fields.get("updated") or "") or timezone.now()
        return code, date

    def _status_slug(self, project: ProjectModel, status: dict) -> str:
        name = status.get("name", "A fazer")
        category = CATEGORY_MAP.get(
            (status.get("statusCategory") or {}).get("key", "new"), "todo"
        )
        slug = name.lower().replace(" ", "-")[:50]
        key = (project.id, slug)
        if key not in self.statuses:
            obj, _ = WorkflowStatusModel.objects.get_or_create(
                project=project,
                slug=slug,
                defaults={
                    "name": name[:80],
                    "category": category,
                    "order": len(self.statuses),
                },
            )
            self.statuses[key] = obj
        return slug

    def _sprint(self, project: ProjectModel, raw: Any) -> SprintModel | None:
        """O campo Sprint é customizado e vem como lista; vale a última."""
        if not raw:
            return None
        entry = raw[-1] if isinstance(raw, list) else raw
        if not isinstance(entry, dict):
            return None
        external = str(entry.get("id", ""))
        if not external:
            return None
        if external in self.sprints:
            return self.sprints[external]
        # Os estados válidos aqui são planned/active/closed. O Jira usa
        # future/active/closed — "completed" não existe dos dois lados, e um
        # valor fora do enum só estoura na LEITURA, derrubando o endpoint.
        state = (entry.get("state") or "").lower()
        # update_or_create, não get_or_create: com `get_`, uma sprint gravada
        # errado numa passada anterior ficaria errada para sempre, porque os
        # defaults só valem na criação. Reimportar tem que corrigir.
        sprint, _ = SprintModel.objects.update_or_create(
            project=project,
            external_key=external,
            defaults={
                "name": (entry.get("name") or "Sprint")[:120],
                "goal": entry.get("goal") or "",
                "status": {"active": "active", "closed": "closed"}.get(state, "planned"),
            },
        )
        self.sprints[external] = sprint
        return sprint

    # ── Execução ────────────────────────────────────────────────────────────

    def handle(self, *args, **options) -> None:
        self.base = os.environ.get("JIRA_URL", "").rstrip("/")
        email = os.environ.get("JIRA_EMAIL", "")
        token = os.environ.get("JIRA_API_TOKEN", "")
        if not (self.base and email and token):
            raise CommandError("Defina JIRA_URL, JIRA_EMAIL e JIRA_API_TOKEN no ambiente.")

        credential = base64.b64encode(f"{email}:{token}".encode()).decode()
        self.headers = {"Authorization": f"Basic {credential}", "Accept": "application/json"}

        try:
            workspace = WorkspaceModel.objects.get(slug=options["workspace"])
        except WorkspaceModel.DoesNotExist as exc:
            raise CommandError(f"Workspace '{options['workspace']}' não existe.") from exc

        self.users = {u.email.lower(): u for u in UserModel.objects.all()}
        # Fallback por nome: no Jira Cloud, e-mail no campo assignee some quando
        # a pessoa marca "esconder e-mail" nas preferências — o e-mail bate
        # normal pra maioria, mas quem escondeu não casa nunca por essa via,
        # mesmo tendo conta aqui. Só usa se o nome for único (nome repetido não
        # dá pra saber qual é quem, aí cai pro texto puro como antes).
        contagem_nomes: dict[str, int] = {}
        por_nome: dict[str, UserModel] = {}
        for u in UserModel.objects.all():
            chave = u.full_name.strip().lower()
            if not chave:
                continue
            contagem_nomes[chave] = contagem_nomes.get(chave, 0) + 1
            por_nome[chave] = u
        self.users_by_name = {k: v for k, v in por_nome.items() if contagem_nomes[k] == 1}
        self.statuses: dict[tuple, WorkflowStatusModel] = {}
        self.sprints: dict[str, SprintModel] = {}
        dry = options["dry_run"]

        # O id do campo Sprint/Story Points muda de site para site; descobrir
        # pelo nome evita cravar customfield_10020 e quebrar em outra conta.
        fields_meta = self._get(f"{API}/field")
        # Um site com projetos team-managed e company-managed convivendo tem
        # MAIS DE UM campo com o mesmo nome ("Story point estimate" aparece
        # duas vezes, e ainda existe "Story Points"). Escolher um só faz os
        # pontos sumirem de todos os projetos que usam o outro — por isso a
        # lista, com o primeiro valor preenchido vencendo na hora da leitura.
        sprint_fields = [f["id"] for f in fields_meta if f.get("name") == "Sprint"] or [
            "customfield_10020"
        ]
        points_fields = [
            f["id"] for f in fields_meta
            if f.get("name") in ("Story Points", "Story point estimate", "Pontos de história")
        ] or ["customfield_10016"]

        wanted = [k.strip().upper() for k in options["projects"].split(",") if k.strip()]
        projects = self._get(f"{API}/project/search", maxResults=100).get("values", [])
        if wanted:
            projects = [p for p in projects if p["key"].upper() in wanted]
        self.stdout.write(f"{len(projects)} projeto(s) a importar")

        total_cards = 0
        for jira_project in projects:
            count = self._import_project(
                jira_project, workspace, sprint_fields, points_fields, dry, options["comments"]
            )
            total_cards += count

        verbo = "seriam importados" if dry else "importados"
        self.stdout.write(self.style.SUCCESS(f"{total_cards} card(s) {verbo}."))

    def _import_project(
        self,
        jira_project: dict,
        workspace: WorkspaceModel,
        sprint_fields: list[str],
        points_fields: list[str],
        dry: bool,
        with_comments: bool,
    ) -> int:
        key = jira_project["key"]
        fields = [
            "summary", "description", "issuetype", "status", "priority", "labels",
            "assignee", "reporter", "created", "updated", "duedate", "parent",
            "resolution", "resolutiondate", "timeoriginalestimate",
            *sprint_fields, *points_fields,
        ]
        issues = self._search(f'project = "{key}" ORDER BY created ASC', fields)
        self.stdout.write(f"  {key} ({jira_project['name']}): {len(issues)} issue(s)")
        if dry:
            return len(issues)

        # Projeto sem issue nenhuma ainda é um projeto: some do destino se a
        # criação depender de ter card.
        with transaction.atomic():
            project, _ = ProjectModel.objects.update_or_create(
                workspace=workspace,
                external_key=key,
                defaults={
                    "name": jira_project["name"][:120],
                    "key": key[:10],
                    "description": jira_project.get("description", "") or "",
                },
            )

            by_external: dict[str, CardModel] = {}
            parents: dict[str, str] = {}

            for issue in issues:
                f = issue["fields"]
                type_name = (f.get("issuetype") or {}).get("name", "").lower()
                priority_name = ((f.get("priority") or {}).get("name") or "medium").lower()
                assignee, assignee_name = self._user(f.get("assignee"))
                reporter, _ = self._user(f.get("reporter"))
                points = next(
                    (f[c] for c in points_fields if isinstance(f.get(c), (int, float))), None
                )
                resolution, resolved_at = self._resolution(f)

                card, _ = CardModel.objects.update_or_create(
                    project=project,
                    external_key=issue["key"],
                    defaults={
                        # Preserva a numeração da origem: GES-37 continua 37.
                        "number": int(issue["key"].rsplit("-", 1)[-1]),
                        "title": (f.get("summary") or "Sem título")[:200],
                        "description": adf_to_text(f.get("description")).strip(),
                        "status": self._status_slug(project, f.get("status") or {}),
                        "type": TYPE_MAP.get(type_name, "chore"),
                        "priority": PRIORITY_MAP.get(priority_name, "medium"),
                        "points": int(points) if isinstance(points, (int, float)) else None,
                        "assignee": assignee,
                        "external_assignee": assignee_name[:120],
                        "reporter": reporter,
                        "sprint": self._sprint(
                            project, next((f[c] for c in sprint_fields if f.get(c)), None)
                        ),
                        "labels": f.get("labels") or [],
                        "due_date": f.get("duedate") or None,
                        "resolution": resolution,
                        "resolved_at": resolved_at,
                        "original_estimate_seconds": f.get("timeoriginalestimate") or None,
                        "source": "jira",
                    },
                )
                by_external[issue["key"]] = card
                parent = f.get("parent")
                if parent:
                    parents[issue["key"]] = parent["key"]

                if with_comments:
                    self._import_comments(issue["key"], card)

            # Segunda passada: o pai pode aparecer depois do filho na listagem,
            # então só dá para ligar a hierarquia com todos já gravados.
            for child_key, parent_key in parents.items():
                child = by_external[child_key]
                parent_card = by_external.get(parent_key)
                if not parent_card:
                    continue
                # O domínio proíbe épico dentro de épico e épico como
                # subtarefa. No Jira novo um Epic pode ter pai (Initiative),
                # e importar esse vínculo invalidaria o card.
                if child.type == "epic":
                    continue
                if parent_card.type == "epic":
                    child.epic = parent_card
                else:
                    child.parent = parent_card
                child.save(update_fields=["epic", "parent"])

        return len(issues)

    def _import_comments(self, issue_key: str, card: CardModel) -> None:
        data = self._get(f"{API}/issue/{issue_key}/comment", maxResults=100)
        for comment in data.get("comments", []):
            author, author_name = self._user(comment.get("author"))
            body = adf_to_text(comment.get("body")).strip()
            if author_name:
                body = f"**{author_name}** (importado do Jira)\n\n{body}"
            CardCommentModel.objects.get_or_create(
                card=card,
                external_key=comment.get("id", ""),
                defaults={"author": author, "body": body},
            )
