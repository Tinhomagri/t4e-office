# mcp-server/oauth_provider.py
"""Provider OAuth do mcp-server — delega login/consentimento pro office,
mas o access_token final é sempre um PersonalAccessToken de verdade.

Ver docs/superpowers/specs/2026-09-01-mcp-oauth-connector-design.md pro
desenho completo do fluxo (Claude -> mcp-server /authorize -> Django
/oauth/consent -> mcp-server /oauth/django-callback -> Claude redirect_uri).
"""
import os
import secrets
import time
from urllib.parse import quote

import httpx
from mcp.server.auth.provider import (
    AccessToken,
    AuthorizationCode,
    AuthorizationParams,
    OAuthAuthorizationServerProvider,
    RefreshToken,
    RegistrationError,
    TokenError,
)
from mcp.shared.auth import OAuthClientInformationFull, OAuthToken

OFFICE_BASE_URL = os.environ.get("OFFICE_BASE_URL", "https://office.t4egroup.com.br")
INTERNAL_API_URL = os.environ.get("T4E_API_URL", "http://web:8000")
INTERNAL_SECRET = os.environ.get("OAUTH_INTERNAL_SECRET", "")
MCP_PUBLIC_URL = os.environ.get("MCP_PUBLIC_URL", "https://mcp.t4egroup.com.br")

_CODE_TTL_SECONDS = 120

# A chamada daqui pro `web` é rede interna do Docker, sem TLS — sem este
# header o Django (SECURE_SSL_REDIRECT) acha que é HTTP inseguro e devolve
# 301 pra https://web:8000, que não existe (web não serve TLS interno).
# Mesmo problema/fix já aplicado em server.py (_request) — aqui repetido
# porque oauth_provider.py usa httpx diretamente, fora daquele helper.
_INTERNAL_HEADERS = {"X-Forwarded-Proto": "https"}


def _internal_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(headers=_INTERNAL_HEADERS)


class T4EOAuthProvider(OAuthAuthorizationServerProvider[AuthorizationCode, RefreshToken, AccessToken]):
    def __init__(self) -> None:
        # Estado em memória — aceitável: processo de vida longa, janela
        # entre /authorize e o callback do Django é de segundos.
        self._pending: dict[str, dict] = {}  # state interno -> {client_id, params}
        self._mcp_codes: dict[str, dict] = {}  # código mcp -> {django_code, client_id, params, created_at}
        # access_token -> client_id que o recebeu — o RevocationHandler do SDK
        # só chama revoke_token() se token.client_id == client_id de quem está
        # pedindo a revogação (rfc7009); sem isso, load_access_token não tem
        # como saber pra qual client aquele PersonalAccessToken foi emitido.
        self._token_client: dict[str, str] = {}

    async def get_client(self, client_id: str) -> OAuthClientInformationFull | None:
        async with _internal_client() as http:
            r = await http.get(f"{INTERNAL_API_URL}/api/oauth/clients/{client_id}/")
        if r.status_code == 404:
            return None
        r.raise_for_status()
        data = r.json()
        return OAuthClientInformationFull(
            client_id=data["client_id"],
            client_name=data.get("client_name", ""),
            redirect_uris=data["redirect_uris"],
            token_endpoint_auth_method=data.get("token_endpoint_auth_method", "client_secret_post"),
            client_secret=data.get("client_secret") or None,
        )

    async def register_client(self, client_info: OAuthClientInformationFull) -> None:
        # token_endpoint_auth_method/client_secret vêm preenchidos pelo
        # RegistrationHandler do SDK antes de chegar aqui — sem persistir e
        # devolver em get_client(), a reconstrução perde esses campos (viram
        # None) e a troca de token falha com "Unsupported auth method: None".
        async with _internal_client() as http:
            r = await http.post(
                f"{INTERNAL_API_URL}/api/oauth/clients/",
                json={
                    "client_id": client_info.client_id,
                    "client_name": client_info.client_name or "",
                    "redirect_uris": [str(u) for u in client_info.redirect_uris],
                    "token_endpoint_auth_method": client_info.token_endpoint_auth_method or "client_secret_post",
                    "client_secret": client_info.client_secret or "",
                },
            )
        if r.status_code >= 400:
            raise RegistrationError(error="invalid_client_metadata", error_description=r.text)

    async def authorize(self, client: OAuthClientInformationFull, params: AuthorizationParams) -> str:
        # client_id vem de register_client() sem restrição de charset (RFC 7591
        # não exige uma) — sem quote(), um client_id malicioso com "&" injetaria
        # parâmetros extras nesta URL (ex.: um redirect_uri falso que a tela de
        # consentimento leria em vez do nosso). state é sempre nosso (token_urlsafe),
        # mas passa por quote() igual, por hábito de nunca interpolar sem escapar.
        state = secrets.token_urlsafe(24)
        self._pending[state] = {"client_id": client.client_id, "params": params}
        return (
            f"{OFFICE_BASE_URL}/oauth/consent"
            f"?client_id={quote(client.client_id, safe='')}"
            f"&redirect_uri={quote(f'{MCP_PUBLIC_URL}/oauth/django-callback', safe='')}"
            f"&state={quote(state, safe='')}"
        )

    def pop_pending(self, state: str) -> dict | None:
        return self._pending.pop(state, None)

    def store_mcp_code(self, mcp_code: str, django_code: str, client_id: str, params: AuthorizationParams) -> None:
        self._mcp_codes[mcp_code] = {
            "django_code": django_code,
            "client_id": client_id,
            "params": params,
            "created_at": time.time(),
        }

    async def load_authorization_code(
        self, client: OAuthClientInformationFull, authorization_code: str
    ) -> AuthorizationCode | None:
        entry = self._mcp_codes.get(authorization_code)
        if entry is None or entry["client_id"] != client.client_id:
            return None
        if time.time() - entry["created_at"] > _CODE_TTL_SECONDS:
            return None
        params: AuthorizationParams = entry["params"]
        return AuthorizationCode(
            code=authorization_code,
            client_id=client.client_id,
            redirect_uri=params.redirect_uri,
            redirect_uri_provided_explicitly=params.redirect_uri_provided_explicitly,
            scopes=["mcp"],
            code_challenge=params.code_challenge,
            expires_at=entry["created_at"] + _CODE_TTL_SECONDS,
            resource=params.resource,
        )

    async def exchange_authorization_code(
        self, client: OAuthClientInformationFull, authorization_code: AuthorizationCode
    ) -> OAuthToken:
        entry = self._mcp_codes.pop(authorization_code.code, None)
        if entry is None:
            raise TokenError(error="invalid_grant", error_description="Código inválido ou já usado.")
        async with _internal_client() as http:
            r = await http.post(
                f"{INTERNAL_API_URL}/api/oauth/token-exchange/",
                json={"code": entry["django_code"]},
                headers={"X-Internal-Secret": INTERNAL_SECRET},
            )
        if r.status_code >= 400:
            raise TokenError(error="invalid_grant", error_description=r.text)
        data = r.json()
        self._token_client[data["access_token"]] = client.client_id
        return OAuthToken(access_token=data["access_token"], token_type="bearer", scope="mcp")

    async def load_refresh_token(self, client: OAuthClientInformationFull, refresh_token: str) -> RefreshToken | None:
        return None

    async def exchange_refresh_token(
        self,
        client: OAuthClientInformationFull,
        refresh_token: RefreshToken,
        scopes: list[str],
    ) -> OAuthToken:
        raise TokenError(error="unsupported_grant_type", error_description="Sem refresh — o token não expira.")

    async def load_access_token(self, token: str) -> AccessToken | None:
        async with _internal_client() as http:
            r = await http.get(f"{INTERNAL_API_URL}/api/auth/me/", headers={"Authorization": f"Bearer {token}"})
        if r.status_code != 200:
            return None
        me = r.json()
        owner_client_id = self._token_client.get(token, "office")
        return AccessToken(token=token, client_id=owner_client_id, scopes=["mcp"], subject=str(me["id"]))

    async def revoke_token(self, token: AccessToken | RefreshToken) -> None:
        raw = token.token
        self._token_client.pop(raw, None)
        async with _internal_client() as http:
            await http.post(
                f"{INTERNAL_API_URL}/api/oauth/revoke-by-value/",
                json={"access_token": raw},
                headers={"X-Internal-Secret": INTERNAL_SECRET},
            )
