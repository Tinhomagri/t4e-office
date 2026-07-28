"""Porta do repositório de leads."""
from abc import ABC, abstractmethod

from contexts.sales.domain.entities.lead import Lead, LeadStatus


class LeadRepository(ABC):
    """Contrato de persistência de leads."""

    @abstractmethod
    def create(self, *, lead: Lead) -> Lead:
        """Persiste um novo lead."""

    @abstractmethod
    def bulk_create(self, *, leads: list[Lead]) -> list[Lead]:
        """Persiste vários leads de uma vez (importação CSV)."""

    @abstractmethod
    def get(self, *, lead_id: str) -> Lead | None:
        """Busca um lead por id (ou None)."""

    @abstractmethod
    def list_by_workspace(
        self,
        *,
        workspace_id: str,
        status: LeadStatus | None = None,
        owner_id: str | None = None,
        search: str = "",
        overdue_only: bool = False,
    ) -> list[Lead]:
        """Lista leads do workspace com os filtros da fila de trabalho."""

    @abstractmethod
    def update(self, *, lead: Lead) -> Lead:
        """Atualiza um lead existente."""

    @abstractmethod
    def delete(self, *, lead_id: str) -> None:
        """Remove um lead."""
