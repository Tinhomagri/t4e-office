"""Caso de uso: listar workspaces do usuário autenticado."""
from contexts.identity.domain.entities.workspace import Workspace
from contexts.identity.domain.repositories.workspace_repository import (
    WorkspaceRepository,
)


class ListWorkspaces:
    """Lista os workspaces em que o usuário é membro."""

    def __init__(self, workspace_repository: WorkspaceRepository):
        self.workspace_repository = workspace_repository

    def execute(self, *, user_id: str) -> list[Workspace]:
        return self.workspace_repository.list_for_user(user_id=user_id)
