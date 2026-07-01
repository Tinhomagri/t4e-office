"""Portas dos repositórios de workspace e membership."""
from abc import ABC, abstractmethod
from dataclasses import dataclass

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

    @abstractmethod
    def list_for_user(self, *, user_id: str) -> list[Workspace]:
        """Lista workspaces em que o usuário é membro."""

    @abstractmethod
    def get(self, *, workspace_id: str) -> Workspace | None:
        """Busca um workspace por id (ou None)."""


@dataclass
class MemberView:
    """Projeção de leitura de um membro (vínculo + dados do usuário)."""

    user_id: str
    name: str
    email: str
    role: str


class MembershipRepository(ABC):
    """Contrato de persistência de vínculos usuário↔workspace."""

    @abstractmethod
    def add(self, *, workspace_id: str, user_id: str, role: Role) -> Membership:
        """Adiciona um membro ao workspace."""

    @abstractmethod
    def exists(self, *, workspace_id: str, user_id: str) -> bool:
        """Indica se o usuário já é membro do workspace."""

    @abstractmethod
    def role_of(self, *, workspace_id: str, user_id: str) -> Role | None:
        """Papel do usuário no workspace (ou None se não for membro)."""

    @abstractmethod
    def list_members(self, *, workspace_id: str) -> list[MemberView]:
        """Lista membros do workspace com dados do usuário."""
