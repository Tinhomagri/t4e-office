"""Porta do repositório de projetos."""
from abc import ABC, abstractmethod

from contexts.projects.domain.entities.project import Project


class ProjectRepository(ABC):
    """Contrato de persistência de projetos."""

    @abstractmethod
    def key_exists_in_workspace(self, *, workspace_id: str, key: str) -> bool:
        """Indica se a chave já existe no workspace."""

    @abstractmethod
    def create(self, *, workspace_id: str, name: str, key: str) -> Project:
        """Persiste um novo projeto."""

    @abstractmethod
    def list_by_workspace(self, *, workspace_id: str) -> list[Project]:
        """Lista projetos de um workspace."""

    @abstractmethod
    def get(self, *, project_id: str) -> Project | None:
        """Busca um projeto por id (ou None)."""


class WorkspaceAccess(ABC):
    """Porta para verificar acesso do usuário ao workspace (cross-context)."""

    @abstractmethod
    def is_member(self, *, workspace_id: str, user_id: str) -> bool:
        """Indica se o usuário é membro do workspace."""
