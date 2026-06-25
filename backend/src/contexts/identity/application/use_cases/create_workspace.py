"""Caso de uso: criação de workspace com o criador como owner."""
import re
from dataclasses import dataclass

from contexts.identity.domain.repositories.workspace_repository import (
    MembershipRepository,
    WorkspaceRepository,
)
from contexts.identity.domain.value_objects.role import Role
from shared.domain.errors import ValidationError


@dataclass
class CreateWorkspaceResult:
    """Resultado da criação de workspace."""

    workspace_id: str
    name: str
    slug: str


def _slugify(name: str) -> str:
    """Gera slug simples: minúsculo, hifens, alfanumérico."""
    slug = re.sub(r"[^a-z0-9]+", "-", name.strip().lower()).strip("-")
    if not slug:
        raise ValidationError("Não foi possível gerar um identificador para o workspace.")
    return slug


class CreateWorkspace:
    """Cria um workspace e vincula o criador como owner, atomicamente."""

    def __init__(
        self,
        workspace_repository: WorkspaceRepository,
        membership_repository: MembershipRepository,
    ):
        self.workspace_repository = workspace_repository
        self.membership_repository = membership_repository

    def execute(self, *, name: str, owner_id: str) -> CreateWorkspaceResult:
        base_slug = _slugify(name)
        slug = base_slug
        suffix = 2
        # Garante unicidade do slug
        while self.workspace_repository.slug_exists(slug):
            slug = f"{base_slug}-{suffix}"
            suffix += 1

        workspace = self.workspace_repository.create(
            name=name, slug=slug, owner_id=owner_id
        )
        self.membership_repository.add(
            workspace_id=str(workspace.id), user_id=owner_id, role=Role.OWNER
        )
        return CreateWorkspaceResult(
            workspace_id=str(workspace.id), name=workspace.name, slug=workspace.slug
        )
