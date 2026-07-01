"""Porta do repositório de sprints."""
from abc import ABC, abstractmethod

from contexts.projects.domain.entities.sprint import Sprint


class SprintRepository(ABC):
    """Contrato de persistência de sprints."""

    @abstractmethod
    def create(self, *, sprint: Sprint) -> Sprint:
        """Persiste uma nova sprint."""

    @abstractmethod
    def list_by_project(self, *, project_id: str) -> list[Sprint]:
        """Lista sprints de um projeto (mais recentes primeiro)."""

    @abstractmethod
    def get(self, *, sprint_id: str) -> Sprint | None:
        """Busca uma sprint por id (ou None)."""

    @abstractmethod
    def update(self, *, sprint: Sprint) -> Sprint:
        """Atualiza uma sprint existente."""

    @abstractmethod
    def clear_active(self, *, project_id: str, except_id: str) -> None:
        """Encerra (closed) outras sprints ativas do projeto ao iniciar uma nova."""
