"""Caso de uso: obter access_token válido, renovando se necessário."""
from datetime import UTC, datetime

from contexts.google.domain.entities.connection import GoogleConnection
from contexts.google.domain.ports.oauth_provider import (
    OAuthProvider,
    OAuthRevokedError,
)
from contexts.google.domain.repositories.connection_repository import (
    ConnectionRepository,
)
from shared.domain.errors import ConflictError


class GoogleNotConnectedError(ConflictError):
    """Usuário não conectou (ou revogou) o Google — precisa reconectar."""


class GetValidCredentials:
    """Retorna um access_token válido para o usuário, com refresh automático."""

    def __init__(
        self,
        *,
        oauth_provider: OAuthProvider,
        connection_repository: ConnectionRepository,
    ):
        self.oauth_provider = oauth_provider
        self.connection_repository = connection_repository

    def execute(self, *, user_id: str) -> str:
        connection = self.connection_repository.get_by_user(user_id=user_id)
        if connection is None or connection.status.value == "revoked":
            raise GoogleNotConnectedError(
                "Conta Google não conectada. Conecte o Google para continuar."
            )

        now = datetime.now(UTC)
        if not connection.is_expired(now=now):
            return connection.access_token

        try:
            tokens = self.oauth_provider.refresh(
                refresh_token=connection.refresh_token
            )
        except OAuthRevokedError as exc:
            connection.mark_revoked()
            self.connection_repository.upsert(connection=connection)
            raise GoogleNotConnectedError(
                "Acesso ao Google expirou. Reconecte sua conta."
            ) from exc

        self._apply_refresh(connection, tokens)
        self.connection_repository.upsert(connection=connection)
        return connection.access_token

    @staticmethod
    def _apply_refresh(connection: GoogleConnection, tokens) -> None:
        connection.access_token = tokens.access_token
        connection.expiry = tokens.expiry
        if tokens.refresh_token:
            connection.refresh_token = tokens.refresh_token
        if tokens.scopes:
            connection.scopes = tokens.scopes
