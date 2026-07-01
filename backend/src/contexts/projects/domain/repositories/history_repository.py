"""Porta do repositório de histórico de cards."""
from abc import ABC, abstractmethod

from contexts.projects.domain.entities.history import CardHistoryEntry


class HistoryRepository(ABC):
    """Contrato de persistência do histórico de alterações."""

    @abstractmethod
    def add(self, *, entry: CardHistoryEntry) -> CardHistoryEntry:
        """Registra uma entrada de histórico."""

    @abstractmethod
    def list_by_card(self, *, card_id: str) -> list[CardHistoryEntry]:
        """Lista o histórico de um card (mais antigo primeiro)."""
