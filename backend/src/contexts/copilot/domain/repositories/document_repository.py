"""Porta do repositório de documentos."""
from abc import ABC, abstractmethod

from contexts.copilot.domain.entities.document import Document


class DocumentRepository(ABC):
    """Contrato de persistência de documentos."""

    @abstractmethod
    def create(self, *, document: Document) -> Document:
        """Persiste um novo documento."""

    @abstractmethod
    def get(self, *, document_id: str) -> Document | None:
        """Busca um documento por id."""

    @abstractmethod
    def list_by_workspace(self, *, workspace_id: str) -> list[Document]:
        """Lista documentos de um workspace."""

    @abstractmethod
    def save(self, *, document: Document) -> Document:
        """Persiste alterações (status/análise) de um documento."""


class WorkspaceAccess(ABC):
    """Porta para verificar acesso do usuário ao workspace (cross-context)."""

    @abstractmethod
    def is_member(self, *, workspace_id: str, user_id: str) -> bool:
        """Indica se o usuário é membro do workspace."""

