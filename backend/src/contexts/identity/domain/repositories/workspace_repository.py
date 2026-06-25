"""Portas dos repositórios de workspace e membership."""
from abc import ABC, abstractmethod

from contexts.identity.domain.entities.workspace import Membership, Workspace
from contexts.identity.domain.value_objects.role import Role


class WorkspaceRepository(ABC):
    """Contrato de persistência de workspaces."""

    @abstractmethod
    def slug_exists(self, slug: str) -> bool:
        """Indica se o slug já está em uso."""

    @abstractmethod
    def create(self, *, name: str, slug: str, owner_id: str) -> Workspace:
        """Persiste um novo workspace."""


class MembershipRepository(ABC):
    """Contrato de persistência de vínculos usuário↔workspace."""

    @abstractmethod
    def add(self, *, workspace_id: str, user_id: str, role: Role) -> Membership:
        """Adiciona um membro ao workspace."""

    @abstractmethod
    def exists(self, *, workspace_id: str, user_id: str) -> bool:
        """Indica se o usuário já é membro do workspace."""
