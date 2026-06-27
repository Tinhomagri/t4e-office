"""Caso de uso: atualização de card (editar, mover de coluna, atribuir)."""
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

# Sentinela para distinguir "campo ausente" de "campo definido como None".
_UNSET = object()


class UpdateCard:
    """Atualiza campos de um card; só altera o que for informado."""

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
        card_id: str,
        actor_id: str,
        title=_UNSET,
        description=_UNSET,
        status=_UNSET,
        type=_UNSET,
        priority=_UNSET,
        points=_UNSET,
        assignee_id=_UNSET,
        reporter_id=_UNSET,
        sprint_id=_UNSET,
        start_date=_UNSET,
        due_date=_UNSET,
        order=_UNSET,
    ) -> Card:
        card = self.card_repository.get(card_id=card_id)
        if card is None:
            raise NotFoundError("Card não encontrado.")
        project = self.project_repository.get(project_id=card.project_id)
        if project is None:
            raise NotFoundError("Projeto não encontrado.")
        if not self.workspace_access.is_member(
            workspace_id=project.workspace_id, user_id=actor_id
        ):
            raise PermissionDeniedError("Você não tem acesso a este card.")

        if title is not _UNSET:
            card.title = title
        if description is not _UNSET:
            card.description = description
        if status is not _UNSET:
            card.status = CardStatus(status)
        if type is not _UNSET:
            card.type = CardType(type)
        if priority is not _UNSET:
            card.priority = CardPriority(priority)
        if points is not _UNSET:
            card.points = points
        if assignee_id is not _UNSET:
            card.assignee_id = assignee_id
        if reporter_id is not _UNSET:
            card.reporter_id = reporter_id
        if sprint_id is not _UNSET:
            card.sprint_id = sprint_id
        if start_date is not _UNSET:
            card.start_date = start_date
        if due_date is not _UNSET:
            card.due_date = due_date
        if order is not _UNSET:
            card.order = order

        # Revalida invariantes do domínio após a mutação.
        card.__post_init__()
        return self.card_repository.update(card=card)
