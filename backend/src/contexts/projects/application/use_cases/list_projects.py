"""Caso de uso: listagem de projetos de um workspace."""
from contexts.projects.domain.entities.project import Project
from contexts.projects.domain.repositories.project_repository import (
    ProjectRepository,
    WorkspaceAccess,
)
from shared.domain.errors import PermissionDeniedError


class ListProjects:
    """Lista projetos de um workspace que o ator pode acessar."""

    def __init__(
        self,
        project_repository: ProjectRepository,
        workspace_access: WorkspaceAccess,
    ):
        self.project_repository = project_repository
        self.workspace_access = workspace_access

    def execute(self, *, workspace_id: str, actor_id: str) -> list[Project]:
        if not self.workspace_access.is_member(
            workspace_id=workspace_id, user_id=actor_id
        ):
            raise PermissionDeniedError("Você não tem acesso a este workspace.")
        return self.project_repository.list_by_workspace(workspace_id=workspace_id)
