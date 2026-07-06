"""Seed de dados para avaliação — cria workspace, usuários, projeto, sprint e cards.

Idempotente: rodar várias vezes não duplica. Uso:

    python manage.py seed_demo

Credenciais criadas (senha `demo1234` para todos):
    admin@t4e.dev   (owner/admin, is_staff)
    ana@t4e.dev     (member)
    bruno@t4e.dev   (member)
"""
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

CARDS = [
    # (title, status, type, priority, points, assignee_email)
    ("Configurar autenticação JWT", "done", "feature", "high", 5, "admin@t4e.dev"),
    ("Tela de login responsiva", "done", "feature", "medium", 3, "ana@t4e.dev"),
    ("Board Kanban com drag-and-drop", "doing", "feature", "high", 8, "bruno@t4e.dev"),
    ("Bug: contador de cards por coluna", "doing", "bug", "urgent", 2, "ana@t4e.dev"),
    ("Notificações in-app ao atribuir", "review", "feature", "medium", 3, "bruno@t4e.dev"),
    ("Dashboard de métricas por status", "todo", "feature", "high", 5, None),
    ("Filtros salvos por projeto", "todo", "feature", "low", 3, "ana@t4e.dev"),
    ("Exportar relatório CSV", "backlog", "chore", "low", 2, None),
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

        # Sprint ativa
        sprint, _ = SprintModel.objects.get_or_create(
            project=project,
            name="Sprint 1",
            defaults={
                "goal": "Entregar núcleo RF-01..06",
                "status": "active",
                "started_at": timezone.now(),
            },
        )

        # Cards
        for i, (title, status, ctype, prio, pts, assignee_email) in enumerate(CARDS, 1):
            assignee = users.get(assignee_email) if assignee_email else None
            card, created = CardModel.objects.get_or_create(
                project=project,
                number=i,
                defaults={
                    "title": title,
                    "status": status,
                    "type": ctype,
                    "priority": prio,
                    "points": pts,
                    "assignee": assignee,
                    "reporter": owner,
                    "sprint": sprint,
                },
            )
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
