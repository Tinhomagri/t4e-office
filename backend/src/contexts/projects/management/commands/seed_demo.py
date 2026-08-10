"""Seed de dados para avaliação — cria workspace, usuários, projeto, sprint e cards.

Idempotente: rodar várias vezes não duplica. Uso:

    python manage.py seed_demo

Credenciais criadas (senha `demo1234` para todos):
    admin@t4e.dev   (owner/admin, is_staff)
    ana@t4e.dev     (member)
    bruno@t4e.dev   (member)
"""
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone
from django.utils.text import slugify

from contexts.identity.infrastructure.django.models import (
    MembershipModel,
    UserModel,
    WorkspaceModel,
)
from contexts.projects.infrastructure.django.models import (
    CardModel,
    NotificationModel,
    ProjectModel,
    SprintModel,
)

PASSWORD = "demo1234"

USERS = [
    ("admin@t4e.dev", "Admin T4E", "owner", True),
    ("ana@t4e.dev", "Ana Souza", "member", False),
    ("bruno@t4e.dev", "Bruno Lima", "member", False),
]

# A sprint começa 4 dias atrás e dura 14, para o burndown já ter história quando
# o avaliador abrir a tela — uma sprint que começa hoje desenha um gráfico vazio.
SPRINT_STARTED_DAYS_AGO = 4
SPRINT_LENGTH_DAYS = 14

# (title, status, type, priority, points, assignee_email, due_offset, resolved_offset)
#
# `due_offset` e `resolved_offset` são dias relativos a hoje. Existem porque a
# primeira versão do seed criava tudo sem prazo e sem data de entrega: quem logava
# como admin caía num "Meu Dia" com cinco zeros e num burndown vazio, e o produto
# parecia não fazer nada. O admin agora tem card atrasado, card vencendo hoje e
# card na semana — que é exatamente o que a tela existe para mostrar.
CARDS = [
    ("Configurar autenticação JWT", "done", "feature", "high", 5, "admin@t4e.dev", -3, -3),
    ("Tela de login responsiva", "done", "feature", "medium", 3, "ana@t4e.dev", -2, -2),
    ("Board Kanban com drag-and-drop", "doing", "feature", "high", 8, "admin@t4e.dev", 0, None),
    ("Bug: contador de cards por coluna", "doing", "bug", "urgent", 2, "admin@t4e.dev", -1, None),
    ("Notificações in-app ao atribuir", "review", "feature", "medium", 3, "bruno@t4e.dev", 2, None),
    ("Dashboard de métricas por status", "todo", "feature", "high", 5, "admin@t4e.dev", 3, None),
    ("Filtros salvos por projeto", "todo", "feature", "low", 3, "ana@t4e.dev", 5, None),
    ("Exportar relatório CSV", "backlog", "chore", "low", 2, None, None, None),
]


class Command(BaseCommand):
    help = "Popula o banco com dados de demonstração para avaliação."

    @transaction.atomic
    def handle(self, *args, **options):
        # Usuários (idempotente por email)
        users: dict[str, UserModel] = {}
        for email, name, _role, is_staff in USERS:
            user, created = UserModel.objects.get_or_create(
                email=email,
                defaults={
                    "full_name": name,
                    "is_active": True,
                    "email_verified": True,
                    "is_staff": is_staff,
                    "is_superuser": is_staff,
                },
            )
            if created:
                user.set_password(PASSWORD)
                user.save(update_fields=["password"])
            users[email] = user
        owner = users["admin@t4e.dev"]

        # Workspace
        workspace, _ = WorkspaceModel.objects.get_or_create(
            slug=slugify("Demo T4E"),
            defaults={"name": "Demo T4E", "owner": owner},
        )
        role_map = {e: r for e, _n, r, _s in USERS}
        for email, user in users.items():
            MembershipModel.objects.get_or_create(
                workspace=workspace,
                user=user,
                defaults={"role": role_map[email]},
            )

        # Projeto
        project, _ = ProjectModel.objects.get_or_create(
            workspace=workspace,
            key="DEMO",
            defaults={"name": "Produto Demo"},
        )

        # Sprint ativa, com janela real. `start_date`/`end_date` não são enfeite: o
        # burndown do "Meu Dia" não desenha sem eles ("Sprint sem datas de início e fim").
        now = timezone.now()
        today = timezone.localdate()
        started = now - timedelta(days=SPRINT_STARTED_DAYS_AGO)
        sprint, _ = SprintModel.objects.get_or_create(
            project=project,
            name="Sprint 1",
            defaults={"goal": "Entregar núcleo RF-01..06", "status": "active"},
        )
        # Atribuído fora do `defaults` de propósito: um banco já semeado pela versão
        # anterior (sem datas) precisa convergir para o estado correto. Continua
        # idempotente — rodar de novo grava os mesmos valores.
        sprint.status = "active"
        sprint.started_at = started
        sprint.start_date = started.date()
        sprint.end_date = started.date() + timedelta(days=SPRINT_LENGTH_DAYS)
        sprint.save(update_fields=["status", "started_at", "start_date", "end_date"])

        # Cards
        for i, row in enumerate(CARDS, 1):
            title, status, ctype, prio, pts, assignee_email, due_off, resolved_off = row
            assignee = users.get(assignee_email) if assignee_email else None
            due_date = today + timedelta(days=due_off) if due_off is not None else None
            # Card em "Concluído" sem `resolution`/`resolved_at` não conta como
            # entregue na velocity nem aparece na curva do burndown.
            resolved_at = (
                now + timedelta(days=resolved_off) if resolved_off is not None else None
            )
            fields = {
                "title": title,
                "status": status,
                "type": ctype,
                "priority": prio,
                "points": pts,
                "assignee": assignee,
                "reporter": owner,
                "sprint": sprint,
                "due_date": due_date,
                "resolution": "done" if status == "done" else "",
                "resolved_at": resolved_at,
            }
            card, created = CardModel.objects.get_or_create(
                project=project, number=i, defaults=fields
            )
            if not created:
                for field, value in fields.items():
                    setattr(card, field, value)
                card.save(update_fields=list(fields))
            # Notificação de exemplo (RF-06) para cards atribuídos
            if created and assignee is not None:
                NotificationModel.objects.create(
                    user_id=assignee.id,
                    type="card_assigned",
                    title=f"Você foi atribuído a {project.key}-{i}",
                    body=title,
                    link=f"/projects/{project.id}/cards/{card.id}",
                )

        self.stdout.write(
            self.style.SUCCESS(
                f"Seed OK: workspace '{workspace.name}', {len(users)} usuários, "
                f"projeto {project.key}, {len(CARDS)} cards. Senha: {PASSWORD}"
            )
        )
