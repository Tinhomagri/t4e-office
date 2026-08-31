"""Porta do repositório de documentos."""
from abc import ABC, abstractmethod

from contexts.copilot.domain.entities.document import Document


class DocumentRepository(ABC):
    """Contrato de persistência de documentos."""

    @abstractmethod
    def create(
        self, *, document: Document, file_content: bytes | None = None, filename: str = ""
    ) -> Document:
        """Persiste um novo documento, opcionalmente com o arquivo original."""

    @abstractmethod
    def get(self, *, document_id: str) -> Document | None:
        """Busca um documento por id."""

    @abstractmethod
    def list_by_workspace(
        self, *, workspace_id: str, project_id: str | None = None
    ) -> list[Document]:
        """Lista documentos de um workspace, opcionalmente filtrando por projeto."""

    @abstractmethod
    def save(self, *, document: Document) -> Document:
        """Persiste alterações (status/análise) de um documento."""


class WorkspaceAccess(ABC):
    """Porta para verificar acesso do usuário ao workspace (cross-context)."""

    @abstractmethod
    def is_member(self, *, workspace_id: str, user_id: str) -> bool:
        """Indica se o usuário é membro do workspace."""

