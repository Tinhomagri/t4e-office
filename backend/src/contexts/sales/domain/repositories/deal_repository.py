"""Porta do repositório de negócios."""
from abc import ABC, abstractmethod

from contexts.sales.domain.entities.deal import Deal


class DealRepository(ABC):
    """Contrato de persistência de negócios."""

    @abstractmethod
    def create(self, *, deal: Deal) -> Deal:
        """Persiste um novo negócio."""

    @abstractmethod
    def get(self, *, deal_id: str) -> Deal | None:
        """Busca um negócio por id (ou None)."""

    @abstractmethod
    def list_by_workspace(
        self,
        *,
        workspace_id: str,
        stage_id: str | None = None,
        customer_id: str | None = None,
        owner_id: str | None = None,
    ) -> list[Deal]:
        """Lista negócios do workspace com filtros opcionais."""

    @abstractmethod
    def update(self, *, deal: Deal) -> Deal:
        """Atualiza um negócio existente."""

    @abstractmethod
    def delete(self, *, deal_id: str) -> None:
        """Remove um negócio."""

    @abstractmethod
    def count_by_stage(self, *, stage_id: str) -> int:
        """Quantidade de negócios num estágio."""

    @abstractmethod
    def last_rank_in_stage(self, *, workspace_id: str, stage_id: str) -> str:
        """Maior rank já usado na coluna (string vazia se não houver negócios)."""
