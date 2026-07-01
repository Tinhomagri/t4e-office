"""Caso de uso: desvincular a conta Google do usuário."""
from contexts.google.domain.repositories.connection_repository import (
    ConnectionRepository,
)


class DisconnectGoogle:
    """Remove a conexão Google do usuário."""

    def __init__(self, *, connection_repository: ConnectionRepository):
        self.connection_repository = connection_repository

    def execute(self, *, user_id: str) -> None:
        self.connection_repository.delete(user_id=user_id)
