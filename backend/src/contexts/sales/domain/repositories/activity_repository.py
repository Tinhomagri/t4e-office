"""Porta do repositório de atividades de negócio."""
from abc import ABC, abstractmethod

from contexts.sales.domain.entities.activity import DealActivity


class ActivityRepository(ABC):
    """Contrato de persistência de atividades."""

    @abstractmethod
    def create(self, *, activity: DealActivity) -> DealActivity:
        """Persiste uma nova atividade."""

    @abstractmethod
    def get(self, *, activity_id: str) -> DealActivity | None:
        """Busca uma atividade por id (ou None)."""

    @abstractmethod
    def list_by_deal(self, *, deal_id: str) -> list[DealActivity]:
        """Lista atividades de um negócio, mais recentes primeiro."""

    @abstractmethod
    def list_by_workspace(
        self,
        *,
        workspace_id: str,
        kind: str | None = None,
        assignee_id: str | None = None,
        pending_only: bool = False,
    ) -> list[DealActivity]:
        """Lista atividades de todos os negócios do workspace (aba Atividades)."""

    @abstractmethod
    def update(self, *, activity: DealActivity) -> DealActivity:
        """Atualiza uma atividade existente."""

    @abstractmethod
    def delete(self, *, activity_id: str) -> None:
        """Remove uma atividade."""
