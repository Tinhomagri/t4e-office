"""Porta do repositório de metas comerciais."""
from abc import ABC, abstractmethod

from contexts.sales.domain.entities.goal import Goal


class GoalRepository(ABC):
    """Contrato de persistência de metas."""

    @abstractmethod
    def create(self, *, goal: Goal) -> Goal:
        """Persiste uma nova meta."""

    @abstractmethod
    def get(self, *, goal_id: str) -> Goal | None:
        """Busca uma meta por id (ou None)."""

    @abstractmethod
    def list_by_workspace(
        self,
        *,
        workspace_id: str,
        period: str | None = None,
        owner_id: str | None = None,
    ) -> list[Goal]:
        """Lista metas do workspace com filtros opcionais."""

    @abstractmethod
    def update(self, *, goal: Goal) -> Goal:
        """Atualiza uma meta existente."""

    @abstractmethod
    def delete(self, *, goal_id: str) -> None:
        """Remove uma meta."""
