"""Porta do repositório de comentários de card."""
from abc import ABC, abstractmethod

from contexts.projects.domain.entities.comment import CardComment


class CommentRepository(ABC):
    """Contrato de persistência de comentários."""

    @abstractmethod
    def list_by_card(self, *, card_id: str) -> list[CardComment]:
        """Lista comentários de um card (mais antigos primeiro)."""

    @abstractmethod
    def create(self, *, comment: CardComment) -> CardComment:
        """Persiste um novo comentário."""
