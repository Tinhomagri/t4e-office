"""Porta do repositório de histórico de negócios."""
from abc import ABC, abstractmethod

from contexts.sales.domain.entities.history import DealHistoryEntry


class DealHistoryRepository(ABC):
    """Contrato de persistência do histórico de negócios."""

    @abstractmethod
    def record(
        self,
        *,
        deal_id: str,
        author_id: str | None,
        field: str,
        from_value: str,
        to_value: str,
    ) -> DealHistoryEntry:
        """Grava uma entrada de histórico."""

    @abstractmethod
    def list_by_deal(self, *, deal_id: str) -> list[DealHistoryEntry]:
        """Lista o histórico de um negócio em ordem cronológica."""
