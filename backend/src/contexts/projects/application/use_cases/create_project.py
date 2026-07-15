"""Caso de uso: criação de projeto dentro de um workspace."""
from dataclasses import dataclass

from contexts.projects.domain.repositories.project_repository import (
    ProjectRepository,
    WorkspaceAccess,
)
from shared.domain.errors import ConflictError, PermissionDeniedError


@dataclass
class CreateProjectResult:
    """Resultado da criação de projeto."""

    project_id: str
    name: str
    key: str
    workspace_id: str
    template: str = "software"


class CreateProject:
    """Cria um projeto, validando acesso ao workspace e unicidade da chave."""

    def __init__(
        self,
        project_repository: ProjectRepository,
        workspace_access: WorkspaceAccess,
    ):
        self.project_repository = project_repository
        self.workspace_access = workspace_access

    def execute(
        self,
        *,
        workspace_id: str,
        name: str,
        key: str,
        actor_id: str,
        template: str = "software",
    ) -> CreateProjectResult:
        # Só membros do workspace podem criar projeto nele
        if not self.workspace_access.is_member(
            workspace_id=workspace_id, user_id=actor_id
        ):
            raise PermissionDeniedError("Você não tem acesso a este workspace.")

        key = key.upper()
        if self.project_repository.key_exists_in_workspace(
            workspace_id=workspace_id, key=key
        ):
            raise ConflictError("Já existe um projeto com esta chave no workspace.")

        project = self.project_repository.create(
            workspace_id=workspace_id, name=name, key=key, template=template
        )
        return CreateProjectResult(
            project_id=str(project.id),
            name=project.name,
            key=project.key,
            workspace_id=str(project.workspace_id),
            template=project.template,
        )
