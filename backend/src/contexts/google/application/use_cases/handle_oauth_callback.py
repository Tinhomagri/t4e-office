"""Caso de uso: tratar o callback OAuth e salvar a conexão."""
from contexts.google.domain.entities.connection import (
    ConnectionStatus,
    GoogleConnection,
)
from contexts.google.domain.ports.oauth_provider import OAuthProvider
from contexts.google.domain.repositories.connection_repository import (
    ConnectionRepository,
)
from contexts.google.domain.repositories.oauth_state_repository import (
    OAuthStateRepository,
)
from shared.domain.errors import ValidationError


class HandleOAuthCallback:
    """Valida o state, troca o code por tokens e persiste a conexão."""

    def __init__(
        self,
        *,
        oauth_provider: OAuthProvider,
        connection_repository: ConnectionRepository,
        state_repository: OAuthStateRepository,
    ):
        self.oauth_provider = oauth_provider
        self.connection_repository = connection_repository
        self.state_repository = state_repository

    def execute(self, *, code: str, state: str) -> GoogleConnection:
        if not code:
            raise ValidationError("Código de autorização ausente.")

        user_id = self.state_repository.consume(state=state)
        if not user_id:
            raise ValidationError("State inválido ou expirado.")

        tokens = self.oauth_provider.exchange_code(code=code)
        if not tokens.refresh_token:
            # Sem refresh_token não há acesso offline — força novo consent.
            raise ValidationError(
                "Google não retornou refresh_token. Tente reconectar concedendo acesso."
            )

        connection = GoogleConnection(
            user_id=user_id,
            google_email=tokens.email or "",
            refresh_token=tokens.refresh_token,
            access_token=tokens.access_token,
            expiry=tokens.expiry,
            scopes=tokens.scopes,
            status=ConnectionStatus.ACTIVE,
        )
        return self.connection_repository.upsert(connection=connection)
