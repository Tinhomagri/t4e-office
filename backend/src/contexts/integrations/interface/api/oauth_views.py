"""Fluxo OAuth das redes sociais.

* GET /integrations/oauth/providers/?workspace_id= — status de configuração
* GET /integrations/oauth/<provider>/url/?workspace_id=&return_to= — inicia
* GET /integrations/oauth/<provider>/callback/?code=&state= — troca o code,
  salva a conta (tokens cifrados) e redireciona ao frontend.
"""
import secrets
from datetime import timedelta

from django.conf import settings
from django.shortcuts import redirect
from django.utils import timezone
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from contexts.copilot.infrastructure.django.models import SocialAccountModel
from contexts.copilot.infrastructure.django.repositories_impl import (
    DjangoWorkspaceAccess,
)
from contexts.github.infrastructure.django.crypto import encrypt
from contexts.integrations.infrastructure import social_oauth
from contexts.integrations.infrastructure.django.models import (
    SocialAppCredentialModel,
    SocialOAuthStateModel,
)
from shared.domain.errors import PermissionDeniedError, ValidationError


def _front(path: str, query: str) -> str:
    base = settings.FRONTEND_URL.rstrip("/")
    return f"{base}{path or '/app/marketing/redes'}?{query}"


class OAuthProvidersView(APIView):
    """Quais providers têm app OAuth configurado (por workspace, fallback env)."""

    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        workspace_id = request.query_params.get("workspace_id")
        return Response(
            {
                "providers": {
                    name: social_oauth.is_configured(name, workspace_id)
                    for name in social_oauth.PROVIDERS
                }
            }
        )


class OAuthUrlView(APIView):
    """Gera a URL de autorização do provider (com state + PKCE quando exigido)."""

    permission_classes = [IsAuthenticated]

    def get(self, request: Request, provider: str) -> Response:
        if provider not in social_oauth.PROVIDERS:
            raise ValidationError(f"Provider desconhecido: {provider}")
        workspace_id = request.query_params.get("workspace_id")
        if not workspace_id:
            raise ValidationError("Informe o workspace_id.")
        if not social_oauth.is_configured(provider, workspace_id):
            raise ValidationError(
                f"App OAuth de {provider} não configurado. Preencha o "
                f"Client ID/Secret em Configurar apps."
            )
        access = DjangoWorkspaceAccess()
        if not access.is_admin(workspace_id=workspace_id, user_id=str(request.user.id)):
            raise PermissionDeniedError("Apenas administradores podem conectar contas.")

        verifier, challenge = ("", "")
        if social_oauth.PROVIDERS[provider].uses_pkce:
            verifier, challenge = social_oauth.make_pkce_pair()
        st = SocialOAuthStateModel.objects.create(
            state=secrets.token_urlsafe(32),
            provider=provider,
            workspace_id=workspace_id,
            user_id=str(request.user.id),
            code_verifier=verifier,
            return_to=request.query_params.get("return_to", ""),
            expires_at=timezone.now() + timedelta(minutes=15),
        )
        return Response(
            {
                "url": social_oauth.build_authorize_url(
                    provider, st.state, challenge, workspace_id
                )
            }
        )


class OAuthCallbackView(APIView):
    """Callback do provider: valida state, troca code e salva a conta."""

    permission_classes = [AllowAny]

    def get(self, request: Request, provider: str):
        state = request.query_params.get("state", "")
        code = request.query_params.get("code", "")
        try:
            st = SocialOAuthStateModel.objects.get(state=state, provider=provider)
        except SocialOAuthStateModel.DoesNotExist:
            return redirect(_front("", "social=error&reason=state"))
        return_to = st.return_to
        expired = st.expires_at < timezone.now()
        st.delete()
        if expired or not code:
            return redirect(_front(return_to, "social=denied"))

        try:
            tokens = social_oauth.exchange_code(
                provider, code, st.code_verifier, str(st.workspace_id)
            )
            access_token = tokens.get("access_token") or (
                (tokens.get("data") or {}).get("access_token", "")
            )
            info = social_oauth.fetch_account_info(provider, access_token)
        except Exception:
            return redirect(_front(return_to, "social=error&reason=exchange"))

        # Facebook publica com o Page Access Token, não com o token do usuário
        store_token = info.get("page_token") or access_token
        expires_in = tokens.get("expires_in")
        SocialAccountModel.objects.update_or_create(
            workspace_id=st.workspace_id,
            channel=provider,
            defaults={
                "account_name": info["account_name"],
                "external_id": info["external_id"],
                "access_token_encrypted": encrypt(store_token),
                "refresh_token_encrypted": encrypt(tokens.get("refresh_token", "") or ""),
                "token_expires_at": (
                    timezone.now() + timedelta(seconds=int(expires_in))
                    if expires_in
                    else None
                ),
                "connected_by_id": str(st.user_id),
            },
        )
        return redirect(_front(return_to, f"social=connected&channel={provider}"))


class OAuthCredentialsView(APIView):
    """Credenciais dos apps OAuth por workspace (admin configura no frontend).

    * GET    ?workspace_id=  → status por provider (client_id, has_secret,
      configured, source, redirect_uri a registrar no app do provedor).
    * PUT    <provider>/     → salva {workspace_id, client_id, client_secret}.
      client_secret vazio no PUT mantém o segredo já salvo (não sobrescreve).
    * DELETE <provider>/     → remove as credenciais do workspace (volta ao env).
    """

    permission_classes = [IsAuthenticated]

    def _require_admin(self, request: Request, workspace_id: str) -> None:
        if not workspace_id:
            raise ValidationError("Informe o workspace_id.")
        access = DjangoWorkspaceAccess()
        if not access.is_admin(workspace_id=workspace_id, user_id=str(request.user.id)):
            raise PermissionDeniedError(
                "Apenas administradores podem configurar apps sociais."
            )

    def get(self, request: Request) -> Response:
        workspace_id = request.query_params.get("workspace_id")
        self._require_admin(request, workspace_id)
        saved = {
            c.provider: c
            for c in SocialAppCredentialModel.objects.filter(workspace_id=workspace_id)
        }
        out = {}
        for name in social_oauth.PROVIDERS:
            cred = saved.get(name)
            env_cid, env_secret = social_oauth._env_credentials(name)
            has_ws = bool(cred and cred.client_id and cred.client_secret_encrypted)
            out[name] = {
                "client_id": (cred.client_id if cred else "") or "",
                "has_secret": bool(cred and cred.client_secret_encrypted),
                "configured": social_oauth.is_configured(name, workspace_id),
                "source": "workspace" if has_ws else ("env" if (env_cid and env_secret) else "none"),
                "redirect_uri": social_oauth.redirect_uri(name),
            }
        return Response({"providers": out})

    def put(self, request: Request, provider: str) -> Response:
        if provider not in social_oauth.PROVIDERS:
            raise ValidationError(f"Provider desconhecido: {provider}")
        workspace_id = str(request.data.get("workspace_id") or "")
        self._require_admin(request, workspace_id)
        client_id = str(request.data.get("client_id") or "").strip()
        client_secret = str(request.data.get("client_secret") or "").strip()
        if not client_id:
            raise ValidationError("Informe o Client ID.")
        cred, _ = SocialAppCredentialModel.objects.get_or_create(
            workspace_id=workspace_id, provider=provider
        )
        cred.client_id = client_id
        if client_secret:  # vazio = mantém o segredo já salvo
            from contexts.github.infrastructure.django.crypto import encrypt

            cred.client_secret_encrypted = encrypt(client_secret)
        elif not cred.client_secret_encrypted:
            raise ValidationError("Informe o Client Secret.")
        cred.updated_by_id = str(request.user.id)
        cred.save()
        return Response(
            {
                "provider": provider,
                "client_id": cred.client_id,
                "has_secret": bool(cred.client_secret_encrypted),
                "configured": True,
                "source": "workspace",
            }
        )

    def delete(self, request: Request, provider: str) -> Response:
        workspace_id = request.query_params.get("workspace_id") or str(
            request.data.get("workspace_id") or ""
        )
        self._require_admin(request, workspace_id)
        SocialAppCredentialModel.objects.filter(
            workspace_id=workspace_id, provider=provider
        ).delete()
        return Response(status=204)
