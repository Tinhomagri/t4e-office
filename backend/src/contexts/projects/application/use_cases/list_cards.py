"""Caso de uso: listagem de cards de um projeto."""
from contexts.projects.domain.entities.card import Card
from contexts.projects.domain.repositories.card_repository import CardRepository
from contexts.projects.domain.repositories.project_repository import (
    ProjectRepository,
    WorkspaceAccess,
)
from shared.domain.errors import NotFoundError, PermissionDeniedError


class ListCards:
    """Lista cards de um projeto, validando acesso ao workspace."""

    def __init__(
        self,
        project_repository: ProjectRepository,
        card_repository: CardRepository,
        workspace_access: WorkspaceAccess,
    ):
        self.project_repository = project_repository
        self.card_repository = card_repository
        self.workspace_access = workspace_access

    def execute(self, *, project_id: str, actor_id: str) -> list[Card]:
        project = self.project_repository.get(project_id=project_id)
        if project is None:
            raise NotFoundError("Projeto não encontrado.")
        if not self.workspace_access.is_member(
            workspace_id=project.workspace_id, user_id=actor_id
        ):
            raise PermissionDeniedError("Você não tem acesso a este projeto.")
        return self.card_repository.list_by_project(project_id=project_id)
