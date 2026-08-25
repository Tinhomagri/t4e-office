"""OAuth oficial das redes sociais — endpoints conforme docs de cada provider.

Fontes (jul/2026):
* Instagram (API with Instagram Login / Business Login):
  authorize https://www.instagram.com/oauth/authorize
  token     https://api.instagram.com/oauth/access_token
  scopes    instagram_business_basic, instagram_business_content_publish
* Facebook Pages (Facebook Login → Page Access Token):
  authorize https://www.facebook.com/v25.0/dialog/oauth
  token     https://graph.facebook.com/v25.0/oauth/access_token
  scopes    pages_show_list, pages_manage_posts
* LinkedIn (3-legged OAuth):
  authorize https://www.linkedin.com/oauth/v2/authorization
  token     https://www.linkedin.com/oauth/v2/accessToken
  scopes    openid profile w_member_social
* X (OAuth 2.0 Authorization Code + PKCE S256, obrigatório):
  authorize https://x.com/i/oauth2/authorize
  token     https://api.x.com/2/oauth2/token
  scopes    tweet.read tweet.write users.read offline.access
* TikTok (Login Kit v2 — usa `client_key` em vez de client_id):
  authorize https://www.tiktok.com/v2/auth/authorize/
  token     https://open.tiktokapis.com/v2/oauth/token/
  scopes    user.info.basic, video.publish
* YouTube (Google OAuth 2.0):
  authorize https://accounts.google.com/o/oauth2/v2/auth
  token     https://oauth2.googleapis.com/token
  scope     https://www.googleapis.com/auth/youtube.upload
"""
from __future__ import annotations

import base64
import hashlib
import secrets
from dataclasses import dataclass, field
from urllib.parse import urlencode

import httpx
from django.conf import settings


@dataclass(frozen=True)
class ProviderConfig:
    name: str
    authorize_url: str
    token_url: str
    scopes: list[str]
    scope_sep: str = " "
    uses_pkce: bool = False
    # TikTok chama o client_id de "client_key"
    client_id_param: str = "client_id"
    extra_authorize: dict = field(default_factory=dict)


PROVIDERS: dict[str, ProviderConfig] = {
    "instagram": ProviderConfig(
        name="instagram",
        authorize_url="https://www.instagram.com/oauth/authorize",
        token_url="https://api.instagram.com/oauth/access_token",
        scopes=["instagram_business_basic", "instagram_business_content_publish"],
        scope_sep=",",
    ),
    "facebook": ProviderConfig(
        name="facebook",
        authorize_url="https://www.facebook.com/v25.0/dialog/oauth",
        token_url="https://graph.facebook.com/v25.0/oauth/access_token",
        scopes=["pages_show_list", "pages_manage_posts"],
        scope_sep=",",
    ),
    "linkedin": ProviderConfig(
        name="linkedin",
        authorize_url="https://www.linkedin.com/oauth/v2/authorization",
        token_url="https://www.linkedin.com/oauth/v2/accessToken",
        scopes=["openid", "profile", "w_member_social"],
    ),
    "x": ProviderConfig(
        name="x",
        authorize_url="https://x.com/i/oauth2/authorize",
        token_url="https://api.x.com/2/oauth2/token",
        scopes=["tweet.read", "tweet.write", "users.read", "offline.access"],
        uses_pkce=True,
    ),
    "tiktok": ProviderConfig(
        name="tiktok",
        authorize_url="https://www.tiktok.com/v2/auth/authorize/",
        token_url="https://open.tiktokapis.com/v2/oauth/token/",
        scopes=["user.info.basic", "video.publish"],
        scope_sep=",",
        client_id_param="client_key",
    ),
    "youtube": ProviderConfig(
        name="youtube",
        authorize_url="https://accounts.google.com/o/oauth2/v2/auth",
        token_url="https://oauth2.googleapis.com/token",
        scopes=[
            "https://www.googleapis.com/auth/youtube.upload",
            "https://www.googleapis.com/auth/youtube.readonly",
        ],
        extra_authorize={"access_type": "offline", "prompt": "consent"},
    ),
}


def credentials(provider: str, workspace_id: str | None = None) -> tuple[str, str]:
    """(client_id, client_secret) do provider.

    As credenciais pertencem ao workspace e são cifradas no banco. Não há
    fallback global: uma chave em `.env` tornaria acidentalmente possível que
    um workspace usasse o app OAuth de outro cliente.
    """
    if workspace_id:
        # Import local evita ciclo de import na carga do app.
        from contexts.github.infrastructure.django.crypto import decrypt
        from contexts.integrations.infrastructure.django.models import (
            SocialAppCredentialModel,
        )

        cred = (
            SocialAppCredentialModel.objects.filter(
                workspace_id=workspace_id, provider=provider
            )
            .only("client_id", "client_secret_encrypted")
            .first()
        )
        if cred and cred.client_id and cred.client_secret_encrypted:
            return cred.client_id, decrypt(cred.client_secret_encrypted)
    return "", ""


def is_configured(provider: str, workspace_id: str | None = None) -> bool:
    cid, csecret = credentials(provider, workspace_id)
    return bool(cid and csecret)


def redirect_uri(provider: str) -> str:
    base = settings.SOCIAL_OAUTH_REDIRECT_BASE.rstrip("/")
    return f"{base}/api/integrations/oauth/{provider}/callback/"


def make_pkce_pair() -> tuple[str, str]:
    """(code_verifier, code_challenge S256) — exigido pelo X."""
    verifier = secrets.token_urlsafe(64)[:128]
    digest = hashlib.sha256(verifier.encode()).digest()
    challenge = base64.urlsafe_b64encode(digest).decode().rstrip("=")
    return verifier, challenge


def build_authorize_url(
    provider: str, state: str, code_challenge: str = "", workspace_id: str | None = None
) -> str:
    cfg = PROVIDERS[provider]
    cid, _ = credentials(provider, workspace_id)
    params = {
        cfg.client_id_param: cid,
        "redirect_uri": redirect_uri(provider),
        "response_type": "code",
        "scope": cfg.scope_sep.join(cfg.scopes),
        "state": state,
        **cfg.extra_authorize,
    }
    if cfg.uses_pkce:
        params["code_challenge"] = code_challenge
        params["code_challenge_method"] = "S256"
    return f"{cfg.authorize_url}?{urlencode(params)}"


def exchange_code(
    provider: str, code: str, code_verifier: str = "", workspace_id: str | None = None
) -> dict:
    """Troca o code por tokens no endpoint oficial. Retorna o JSON do provider.

    Normaliza para: {access_token, refresh_token?, expires_in?, open_id?/user_id?}
    """
    cfg = PROVIDERS[provider]
    cid, csecret = credentials(provider, workspace_id)
    data = {
        cfg.client_id_param: cid,
        "client_secret": csecret,
        "code": code,
        "grant_type": "authorization_code",
        "redirect_uri": redirect_uri(provider),
    }
    auth = None
    if cfg.uses_pkce:
        data["code_verifier"] = code_verifier
        # X: confidential clients autenticam com Basic auth
        data.pop("client_secret", None)
        data = {**data, "client_id": cid}
        auth = (cid, csecret)
    resp = httpx.post(
        cfg.token_url,
        data=data,
        auth=auth,
        headers={"Accept": "application/json"},
        timeout=20,
    )
    resp.raise_for_status()
    return resp.json()


def fetch_account_info(provider: str, access_token: str) -> dict:
    """Busca nome/id da conta conectada. Retorna {external_id, account_name}.

    Facebook: pega a primeira Página e troca pelo Page Access Token
    (retornado em `page_token` — é ele que publica).
    """
    headers = {"Authorization": f"Bearer {access_token}"}
    if provider == "instagram":
        r = httpx.get(
            "https://graph.instagram.com/me",
            params={"fields": "user_id,username", "access_token": access_token},
            timeout=15,
        )
        r.raise_for_status()
        d = r.json()
        return {"external_id": str(d.get("user_id", "")), "account_name": f"@{d.get('username', '')}"}
    if provider == "facebook":
        r = httpx.get(
            "https://graph.facebook.com/v25.0/me/accounts",
            params={"access_token": access_token},
            timeout=15,
        )
        r.raise_for_status()
        pages = r.json().get("data") or []
        if not pages:
            raise ValueError("Nenhuma Página do Facebook disponível para esta conta.")
        page = pages[0]
        return {
            "external_id": str(page.get("id", "")),
            "account_name": page.get("name", ""),
            "page_token": page.get("access_token", ""),
        }
    if provider == "linkedin":
        r = httpx.get("https://api.linkedin.com/v2/userinfo", headers=headers, timeout=15)
        r.raise_for_status()
        d = r.json()
        return {"external_id": d.get("sub", ""), "account_name": d.get("name", "")}
    if provider == "x":
        r = httpx.get("https://api.x.com/2/users/me", headers=headers, timeout=15)
        r.raise_for_status()
        d = r.json().get("data") or {}
        return {"external_id": d.get("id", ""), "account_name": f"@{d.get('username', '')}"}
    if provider == "tiktok":
        r = httpx.get(
            "https://open.tiktokapis.com/v2/user/info/",
            params={"fields": "open_id,display_name"},
            headers=headers,
            timeout=15,
        )
        r.raise_for_status()
        d = (r.json().get("data") or {}).get("user") or {}
        return {"external_id": d.get("open_id", ""), "account_name": d.get("display_name", "")}
    if provider == "youtube":
        r = httpx.get(
            "https://www.googleapis.com/youtube/v3/channels",
            params={"part": "snippet", "mine": "true"},
            headers=headers,
            timeout=15,
        )
        r.raise_for_status()
        items = r.json().get("items") or []
        if not items:
            raise ValueError("Nenhum canal do YouTube nesta conta Google.")
        ch = items[0]
        return {
            "external_id": ch.get("id", ""),
            "account_name": (ch.get("snippet") or {}).get("title", ""),
        }
    raise ValueError(f"Provider desconhecido: {provider}")
