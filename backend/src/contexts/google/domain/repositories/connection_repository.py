"""Porta do repositório de conexões Google."""
from abc import ABC, abstractmethod

from contexts.google.domain.entities.connection import GoogleConnection


class ConnectionRepository(ABC):
    """Contrato de persistência das conexões Google (1 por usuário)."""

    @abstractmethod
    def get_by_user(self, *, user_id: str) -> GoogleConnection | None:
        """Retorna a conexão do usuário, ou None."""

    @abstractmethod
    def upsert(self, *, connection: GoogleConnection) -> GoogleConnection:
        """Cria ou atualiza a conexão do usuário (tokens cifrados na infra)."""

    @abstractmethod
    def delete(self, *, user_id: str) -> None:
        """Remove a conexão do usuário (desvincular)."""
