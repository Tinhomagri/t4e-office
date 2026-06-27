"""Implementações Django dos repositórios do contexto projects."""
from django.db.models import Max

from contexts.identity.infrastructure.django.models import MembershipModel
from contexts.projects.domain.entities.card import (
    Card,
    CardPriority,
    CardStatus,
    CardType,
)
from contexts.projects.domain.entities.project import Project
from contexts.projects.domain.entities.sprint import Sprint, SprintStatus
from contexts.projects.domain.repositories.card_repository import CardRepository
from contexts.projects.domain.repositories.project_repository import (
    ProjectRepository,
    WorkspaceAccess,
)
from contexts.projects.domain.repositories.sprint_repository import SprintRepository
from contexts.projects.infrastructure.django.models import (
    CardModel,
    ProjectModel,
    SprintModel,
)


def _to_entity(row: ProjectModel) -> Project:
    """Traduz o model ORM para a entidade de domínio."""
    return Project(
        id=str(row.id),
        workspace_id=str(row.workspace_id),
        name=row.name,
        key=row.key,
    )


def _card_to_entity(row: CardModel) -> Card:
    """Traduz o model ORM de card para a entidade de domínio."""
    return Card(
        id=str(row.id),
        project_id=str(row.project_id),
        number=row.number,
        title=row.title,
        description=row.description,
        status=CardStatus(row.status),
        type=CardType(row.type),
        priority=CardPriority(row.priority),
        points=row.points,
        assignee_id=str(row.assignee_id) if row.assignee_id else None,
        sprint_id=str(row.sprint_id) if row.sprint_id else None,
        order=row.order,
        source=row.source,
    )


def _sprint_to_entity(row: SprintModel) -> Sprint:
    """Traduz o model ORM de sprint para a entidade de domínio."""
    return Sprint(
        id=str(row.id),
        project_id=str(row.project_id),
        name=row.name,
        goal=row.goal,
        start_date=row.start_date,
        end_date=row.end_date,
        status=SprintStatus(row.status),
    )


class DjangoProjectRepository(ProjectRepository):
    """Persistência de projetos via Django ORM."""

    def key_exists_in_workspace(self, *, workspace_id: str, key: str) -> bool:
        return ProjectModel.objects.filter(
            workspace_id=workspace_id, key=key
        ).exists()

    def create(self, *, workspace_id: str, name: str, key: str) -> Project:
        row = ProjectModel.objects.create(
            workspace_id=workspace_id, name=name, key=key
        )
        return _to_entity(row)

    def list_by_workspace(self, *, workspace_id: str) -> list[Project]:
        rows = ProjectModel.objects.filter(workspace_id=workspace_id)
        return [_to_entity(r) for r in rows]

    def get(self, *, project_id: str) -> Project | None:
        row = ProjectModel.objects.filter(id=project_id).first()
        return _to_entity(row) if row else None


class DjangoCardRepository(CardRepository):
    """Persistência de cards via Django ORM."""

    def next_number(self, *, project_id: str) -> int:
        agg = CardModel.objects.filter(project_id=project_id).aggregate(m=Max("number"))
        return (agg["m"] or 0) + 1

    def create(self, *, card: Card) -> Card:
        row = CardModel.objects.create(
            project_id=card.project_id,
            number=card.number,
            title=card.title,
            description=card.description,
            status=card.status.value,
            type=card.type.value,
            priority=card.priority.value,
            points=card.points,
            assignee_id=card.assignee_id,
            sprint_id=card.sprint_id,
            order=card.order,
            source=card.source,
        )
        return _card_to_entity(row)

    def list_by_project(self, *, project_id: str) -> list[Card]:
        rows = CardModel.objects.filter(project_id=project_id)
        return [_card_to_entity(r) for r in rows]

    def get(self, *, card_id: str) -> Card | None:
        row = CardModel.objects.filter(id=card_id).first()
        return _card_to_entity(row) if row else None

    def update(self, *, card: Card) -> Card:
        CardModel.objects.filter(id=card.id).update(
            title=card.title,
            description=card.description,
            status=card.status.value,
            type=card.type.value,
            priority=card.priority.value,
            points=card.points,
            assignee_id=card.assignee_id,
            sprint_id=card.sprint_id,
            order=card.order,
        )
        row = CardModel.objects.get(id=card.id)
        return _card_to_entity(row)


class DjangoSprintRepository(SprintRepository):
    """Persistência de sprints via Django ORM."""

    def create(self, *, sprint: Sprint) -> Sprint:
        row = SprintModel.objects.create(
            project_id=sprint.project_id,
            name=sprint.name,
            goal=sprint.goal,
            start_date=sprint.start_date,
            end_date=sprint.end_date,
            status=sprint.status.value,
        )
        return _sprint_to_entity(row)

    def list_by_project(self, *, project_id: str) -> list[Sprint]:
        rows = SprintModel.objects.filter(project_id=project_id)
        return [_sprint_to_entity(r) for r in rows]

    def get(self, *, sprint_id: str) -> Sprint | None:
        row = SprintModel.objects.filter(id=sprint_id).first()
        return _sprint_to_entity(row) if row else None

    def update(self, *, sprint: Sprint) -> Sprint:
        SprintModel.objects.filter(id=sprint.id).update(
            name=sprint.name,
            goal=sprint.goal,
            start_date=sprint.start_date,
            end_date=sprint.end_date,
            status=sprint.status.value,
        )
        row = SprintModel.objects.get(id=sprint.id)
        return _sprint_to_entity(row)

    def clear_active(self, *, project_id: str, except_id: str) -> None:
        # Garante no máximo uma sprint ativa por projeto: encerra as demais.
        SprintModel.objects.filter(project_id=project_id, status="active").exclude(
            id=except_id
        ).update(status="closed")


class DjangoWorkspaceAccess(WorkspaceAccess):
    """Verifica acesso ao workspace consultando memberships do contexto identity."""

    def is_member(self, *, workspace_id: str, user_id: str) -> bool:
        return MembershipModel.objects.filter(
            workspace_id=workspace_id, user_id=user_id
        ).exists()
