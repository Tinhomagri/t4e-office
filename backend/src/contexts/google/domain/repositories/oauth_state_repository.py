"""Porta do repositório de states OAuth (proteção CSRF, TTL curto)."""
from abc import ABC, abstractmethod


class OAuthStateRepository(ABC):
    """Guarda o `state` emitido no início do fluxo p/ validar no callback."""

    @abstractmethod
    def create(self, *, state: str, user_id: str) -> None:
        """Persiste o state vinculado ao usuário que iniciou o fluxo."""

    @abstractmethod
    def consume(self, *, state: str) -> str | None:
        """Valida e invalida o state. Retorna o user_id, ou None se inválido/expirado."""
