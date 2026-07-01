"""Caso de uso: gerar URL de consentimento Google."""
import secrets

from contexts.google.domain.ports.oauth_provider import OAuthProvider
from contexts.google.domain.repositories.oauth_state_repository import (
    OAuthStateRepository,
)


class GetAuthorizationUrl:
    """Emite a URL de consent e registra o `state` (CSRF) do usuário."""

    def __init__(
        self,
        *,
        oauth_provider: OAuthProvider,
        state_repository: OAuthStateRepository,
    ):
        self.oauth_provider = oauth_provider
        self.state_repository = state_repository

    def execute(self, *, user_id: str) -> str:
        state = secrets.token_urlsafe(32)
        self.state_repository.create(state=state, user_id=user_id)
        return self.oauth_provider.build_authorization_url(state=state)
