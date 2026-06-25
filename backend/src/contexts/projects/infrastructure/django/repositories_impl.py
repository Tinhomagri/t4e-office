"""Implementações Django dos repositórios do contexto projects."""
from contexts.identity.infrastructure.django.models import MembershipModel
from contexts.projects.domain.entities.project import Project
from contexts.projects.domain.repositories.project_repository import (
    ProjectRepository,
    WorkspaceAccess,
)
from contexts.projects.infrastructure.django.models import ProjectModel


def _to_entity(row: ProjectModel) -> Project:
    """Traduz o model ORM para a entidade de domínio."""
    return Project(
        id=str(row.id),
        workspace_id=str(row.workspace_id),
        name=row.name,
        key=row.key,
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


class DjangoWorkspaceAccess(WorkspaceAccess):
    """Verifica acesso ao workspace consultando memberships do contexto identity."""

    def is_member(self, *, workspace_id: str, user_id: str) -> bool:
        return MembershipModel.objects.filter(
            workspace_id=workspace_id, user_id=user_id
        ).exists()
