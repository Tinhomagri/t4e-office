"""Caso de uso: criação de card dentro de um projeto."""
from contexts.projects.domain.entities.card import (
    Card,
    CardPriority,
    CardStatus,
    CardType,
)
from contexts.projects.domain.repositories.card_repository import CardRepository
from contexts.projects.domain.repositories.project_repository import (
    ProjectRepository,
    WorkspaceAccess,
)
from shared.domain.errors import NotFoundError, PermissionDeniedError


class CreateCard:
    """Cria um card, validando acesso ao workspace dono do projeto."""

    def __init__(
        self,
        project_repository: ProjectRepository,
        card_repository: CardRepository,
        workspace_access: WorkspaceAccess,
    ):
        self.project_repository = project_repository
        self.card_repository = card_repository
        self.workspace_access = workspace_access

    def execute(
        self,
        *,
        project_id: str,
        title: str,
        actor_id: str,
        description: str = "",
        status: str = "todo",
        type: str = "feature",
        priority: str = "medium",
        points: int | None = None,
        assignee_id: str | None = None,
        sprint_id: str | None = None,
        source: str = "manual",
    ) -> Card:
        project = self.project_repository.get(project_id=project_id)
        if project is None:
            raise NotFoundError("Projeto não encontrado.")
        if not self.workspace_access.is_member(
            workspace_id=project.workspace_id, user_id=actor_id
        ):
            raise PermissionDeniedError("Você não tem acesso a este projeto.")

        number = self.card_repository.next_number(project_id=project_id)
        card = Card(
            id=None,
            project_id=project_id,
            number=number,
            title=title,
            description=description,
            status=CardStatus(status),
            type=CardType(type),
            priority=CardPriority(priority),
            points=points,
            assignee_id=assignee_id,
            sprint_id=sprint_id,
            source=source,
        )
        return self.card_repository.create(card=card)
