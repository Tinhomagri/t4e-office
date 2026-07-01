"""Porta do repositório de cards."""
from abc import ABC, abstractmethod

from contexts.projects.domain.entities.card import Card


class CardRepository(ABC):
    """Contrato de persistência de cards."""

    @abstractmethod
    def next_number(self, *, project_id: str) -> int:
        """Próximo número sequencial de card no projeto."""

    @abstractmethod
    def create(self, *, card: Card) -> Card:
        """Persiste um novo card."""

    @abstractmethod
    def list_by_project(self, *, project_id: str) -> list[Card]:
        """Lista cards de um projeto."""

    @abstractmethod
    def get(self, *, card_id: str) -> Card | None:
        """Busca um card por id (ou None)."""

    @abstractmethod
    def update(self, *, card: Card) -> Card:
        """Atualiza um card existente."""
