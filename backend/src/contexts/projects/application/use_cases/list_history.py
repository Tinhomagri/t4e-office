"""Caso de uso: listagem do histórico de um card."""
from contexts.projects.domain.entities.history import CardHistoryEntry
from contexts.projects.domain.repositories.card_repository import CardRepository
from contexts.projects.domain.repositories.history_repository import HistoryRepository
from contexts.projects.domain.repositories.project_repository import (
    ProjectRepository,
    WorkspaceAccess,
)
from shared.domain.errors import NotFoundError, PermissionDeniedError


class ListHistory:
    """Lista o histórico de alterações de um card, validando acesso."""

    def __init__(
        self,
        project_repository: ProjectRepository,
        card_repository: CardRepository,
        history_repository: HistoryRepository,
        workspace_access: WorkspaceAccess,
    ):
        self.project_repository = project_repository
        self.card_repository = card_repository
        self.history_repository = history_repository
        self.workspace_access = workspace_access

    def execute(self, *, card_id: str, actor_id: str) -> list[CardHistoryEntry]:
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
        return self.history_repository.list_by_card(card_id=card_id)
