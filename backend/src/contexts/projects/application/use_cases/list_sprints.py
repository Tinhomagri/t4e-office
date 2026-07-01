"""Caso de uso: listagem de sprints de um projeto."""
from contexts.projects.domain.entities.sprint import Sprint
from contexts.projects.domain.repositories.project_repository import (
    ProjectRepository,
    WorkspaceAccess,
)
from contexts.projects.domain.repositories.sprint_repository import SprintRepository
from shared.domain.errors import NotFoundError, PermissionDeniedError


class ListSprints:
    """Lista sprints de um projeto, validando acesso ao workspace."""

    def __init__(
        self,
        project_repository: ProjectRepository,
        sprint_repository: SprintRepository,
        workspace_access: WorkspaceAccess,
    ):
        self.project_repository = project_repository
        self.sprint_repository = sprint_repository
        self.workspace_access = workspace_access

    def execute(self, *, project_id: str, actor_id: str) -> list[Sprint]:
        project = self.project_repository.get(project_id=project_id)
        if project is None:
            raise NotFoundError("Projeto não encontrado.")
        if not self.workspace_access.is_member(
            workspace_id=project.workspace_id, user_id=actor_id
        ):
            raise PermissionDeniedError("Você não tem acesso a este projeto.")
        return self.sprint_repository.list_by_project(project_id=project_id)
