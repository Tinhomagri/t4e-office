"""Implementação do OAuthProvider usando google-auth-oauthlib."""
import os
from datetime import UTC, datetime

# Google devolve escopos abreviados (ex.: "email" em vez da URL completa),
# oauthlib rejeita isso como "Scope has changed" sem essa flag.
os.environ.setdefault("OAUTHLIB_RELAX_TOKEN_SCOPE", "1")

import requests
from django.conf import settings
from google.auth.exceptions import RefreshError
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow

from contexts.google.domain.ports.oauth_provider import (
    OAuthError,
    OAuthProvider,
    OAuthRevokedError,
    OAuthTokens,
)

SCOPES = [
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/userinfo.email",
    "openid",
]

_TOKEN_URI = "https://oauth2.googleapis.com/token"
_USERINFO_URI = "https://www.googleapis.com/oauth2/v3/userinfo"


def _client_config() -> dict:
    return {
        "web": {
            "client_id": settings.GOOGLE_OAUTH_CLIENT_ID,
            "client_secret": settings.GOOGLE_OAUTH_CLIENT_SECRET,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": _TOKEN_URI,
            "redirect_uris": [settings.GOOGLE_OAUTH_REDIRECT_URI],
        }
    }


def _aware(dt: datetime | None) -> datetime:
    if dt is None:
        return datetime.now(UTC)
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


class GoogleOAuthProvider(OAuthProvider):
    """Fluxo OAuth web do Google."""

    def _flow(self) -> Flow:
        # PKCE off: authorization e callback usam instâncias de Flow separadas
        # (processos/requests distintos), então o code_verifier gerado na primeira
        # nunca chega na segunda ("Missing code verifier"). Confidential client
        # (tem client_secret) não precisa de PKCE.
        flow = Flow.from_client_config(
            _client_config(), scopes=SCOPES, autogenerate_code_verifier=False
        )
        flow.redirect_uri = settings.GOOGLE_OAUTH_REDIRECT_URI
        return flow

    def build_authorization_url(self, *, state: str) -> str:
        flow = self._flow()
        url, _ = flow.authorization_url(
            access_type="offline",
            include_granted_scopes="true",
            prompt="consent",
            state=state,
        )
        return url

    def exchange_code(self, *, code: str) -> OAuthTokens:
        flow = self._flow()
        try:
            flow.fetch_token(code=code)
        except Exception as exc:  # rede / code inválido
            raise OAuthError(f"Falha ao trocar code por tokens: {exc}") from exc

        creds = flow.credentials
        return OAuthTokens(
            access_token=creds.token,
            refresh_token=creds.refresh_token,
            expiry=_aware(creds.expiry),
            scopes=list(creds.scopes or SCOPES),
            email=self._fetch_email(creds.token),
        )

    def refresh(self, *, refresh_token: str) -> OAuthTokens:
        creds = Credentials(
            token=None,
            refresh_token=refresh_token,
            token_uri=_TOKEN_URI,
            client_id=settings.GOOGLE_OAUTH_CLIENT_ID,
            client_secret=settings.GOOGLE_OAUTH_CLIENT_SECRET,
            scopes=SCOPES,
        )
        try:
            creds.refresh(GoogleRequest())
        except RefreshError as exc:
            raise OAuthRevokedError("Refresh token revogado ou inválido.") from exc
        except Exception as exc:
            raise OAuthError(f"Falha ao renovar token: {exc}") from exc

        return OAuthTokens(
            access_token=creds.token,
            refresh_token=creds.refresh_token or refresh_token,
            expiry=_aware(creds.expiry),
            scopes=list(creds.scopes or SCOPES),
        )

    @staticmethod
    def _fetch_email(access_token: str) -> str | None:
        try:
            resp = requests.get(
                _USERINFO_URI,
                headers={"Authorization": f"Bearer {access_token}"},
                timeout=10,
            )
            if resp.ok:
                return resp.json().get("email")
        except requests.RequestException:
            pass
        return None
