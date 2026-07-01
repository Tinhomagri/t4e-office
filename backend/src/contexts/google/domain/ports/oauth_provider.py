"""Porta de saída: provedor OAuth (impl Google)."""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class OAuthTokens:
    """Tokens retornados pelo provedor após troca de code ou refresh."""

    access_token: str
    expiry: datetime
    scopes: list[str] = field(default_factory=list)
    # No refresh, o Google pode não devolver um novo refresh_token; fica None.
    refresh_token: str | None = None
    email: str | None = None


class OAuthError(Exception):
    """Falha genérica no fluxo OAuth (troca/refresh)."""


class OAuthRevokedError(OAuthError):
    """O refresh_token foi revogado/expirado — exige reconexão."""


class OAuthProvider(ABC):
    """Contrato do provedor OAuth."""

    @abstractmethod
    def build_authorization_url(self, *, state: str) -> str:
        """URL de consentimento para o usuário autorizar os escopos."""

    @abstractmethod
    def exchange_code(self, *, code: str) -> OAuthTokens:
        """Troca o authorization code por tokens (inclui refresh_token e email)."""

    @abstractmethod
    def refresh(self, *, refresh_token: str) -> OAuthTokens:
        """Renova o access_token. Levanta OAuthRevokedError se revogado."""
