"""Configuração segura da biblioteca Google Drive por workspace."""
from __future__ import annotations

import secrets
from datetime import timedelta
from urllib.parse import urlencode

import httpx
from django.conf import settings
from django.shortcuts import redirect
from django.utils import timezone
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2.credentials import Credentials
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from contexts.copilot.infrastructure.django.repositories_impl import DjangoWorkspaceAccess
from contexts.integrations.infrastructure.drive_config import (
    credentials_for_workspace,
    get_config,
    oauth_client_for_workspace,
    public_config,
    save_config,
)
from contexts.integrations.infrastructure.django.models import SocialOAuthStateModel
from shared.domain.errors import PermissionDeniedError, ValidationError
from shared.interface.permissions import SpaceAccessPermission


def _require_marketing_admin(request: Request, workspace_id: str) -> None:
    if not workspace_id:
        raise ValidationError("Informe o workspace_id.")
    role = DjangoWorkspaceAccess().role(workspace_id=workspace_id, user_id=str(request.user.id))
    if role not in ("owner", "admin"):
        raise PermissionDeniedError("Apenas dono ou administrador podem configurar o Google Drive.")


def _require_member(request: Request, workspace_id: str) -> bool:
    if not workspace_id:
        raise ValidationError("Informe o workspace_id.")
    role = DjangoWorkspaceAccess().role(workspace_id=workspace_id, user_id=str(request.user.id))
    if role is None:
        raise PermissionDeniedError("Você não tem acesso a este workspace.")
    return role in ("owner", "admin")


DRIVE_SCOPE = "https://www.googleapis.com/auth/drive"


def _redirect_uri() -> str:
    return f"{settings.DRIVE_OAUTH_REDIRECT_BASE.rstrip('/')}/api/integrations/drive/oauth/callback/"


def _front(result: str) -> str:
    return f"{settings.FRONTEND_URL.rstrip('/')}/app/marketing/biblioteca?{urlencode({'drive': result})}"


class DriveConfigView(APIView):
    """Lê status mascarado e grava a configuração cifrada do Drive."""

    permission_classes = [IsAuthenticated, SpaceAccessPermission]
    required_space = "marketing"

    def get(self, request: Request) -> Response:
        workspace_id = str(request.query_params.get("workspace_id") or "")
        is_owner = _require_member(request, workspace_id)
        payload = public_config(get_config(workspace_id))
        # Membros podem saber se a biblioteca está pronta, mas só o dono vê
        # até mesmo as dicas mascaradas dos identificadores.
        if not is_owner:
            payload["hints"] = {}
        payload["can_configure"] = is_owner
        payload["redirect_uri"] = _redirect_uri() if is_owner else ""
        return Response(payload)

    def put(self, request: Request) -> Response:
        workspace_id = str(request.data.get("workspace_id") or "")
        _require_marketing_admin(request, workspace_id)
        cfg = save_config(
            workspace_id=workspace_id,
            actor_id=str(request.user.id),
            values=request.data,
            is_active=bool(request.data.get("is_active", True)),
        )
        return Response(public_config(cfg))


class DriveOAuthUrlView(APIView):
    """Inicia o consentimento do Google e nunca expõe o refresh token ao browser."""

    permission_classes = [IsAuthenticated, SpaceAccessPermission]
    required_space = "marketing"

    def get(self, request: Request) -> Response:
        workspace_id = str(request.query_params.get("workspace_id") or "")
        _require_marketing_admin(request, workspace_id)
        client_id, _ = oauth_client_for_workspace(workspace_id)
        state = secrets.token_urlsafe(32)
        SocialOAuthStateModel.objects.create(
            state=state,
            provider="google_drive",
            workspace_id=workspace_id,
            user_id=str(request.user.id),
            expires_at=timezone.now() + timedelta(minutes=15),
        )
        query = urlencode({
            "client_id": client_id,
            "redirect_uri": _redirect_uri(),
            "response_type": "code",
            "scope": DRIVE_SCOPE,
            "access_type": "offline",
            # Garante que o Google reenvie um refresh token numa reconexão.
            "prompt": "consent",
            "include_granted_scopes": "true",
            "state": state,
        })
        return Response({"url": f"https://accounts.google.com/o/oauth2/v2/auth?{query}"})


class DriveOAuthCallbackView(APIView):
    """Recebe o code do Google e persiste só a versão cifrada do token."""

    permission_classes = [AllowAny]

    def get(self, request: Request):
        state = str(request.query_params.get("state") or "")
        code = str(request.query_params.get("code") or "")
        oauth_state = SocialOAuthStateModel.objects.filter(
            state=state, provider="google_drive"
        ).first()
        if oauth_state is None:
            return redirect(_front("error"))
        expired = oauth_state.expires_at < timezone.now()
        workspace_id, user_id = str(oauth_state.workspace_id), str(oauth_state.user_id)
        oauth_state.delete()
        if expired or not code:
            return redirect(_front("denied"))
        try:
            client_id, client_secret = oauth_client_for_workspace(workspace_id)
            token_response = httpx.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "code": code,
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "redirect_uri": _redirect_uri(),
                    "grant_type": "authorization_code",
                },
                timeout=15,
            )
            token_response.raise_for_status()
            refresh_token = str(token_response.json().get("refresh_token") or "")
            if not refresh_token:
                return redirect(_front("error"))
            cfg = get_config(workspace_id)
            save_config(
                workspace_id=workspace_id,
                actor_id=user_id,
                values={"refresh_token": refresh_token},
                is_active=bool(cfg and cfg.is_active),
            )
        except Exception:
            return redirect(_front("error"))
        return redirect(_front("connected"))


class DriveConfigTestView(APIView):
    """Testa token e permissões das duas raízes sem revelar segredo algum."""

    permission_classes = [IsAuthenticated, SpaceAccessPermission]
    required_space = "marketing"

    def post(self, request: Request) -> Response:
        workspace_id = str(request.data.get("workspace_id") or "")
        _require_marketing_admin(request, workspace_id)
        try:
            drive = credentials_for_workspace(workspace_id)
            credentials = Credentials(
                token=None,
                refresh_token=drive.refresh_token,
                token_uri="https://oauth2.googleapis.com/token",
                client_id=drive.client_id,
                client_secret=drive.client_secret,
                scopes=["https://www.googleapis.com/auth/drive"],
            )
            credentials.refresh(GoogleRequest())
            headers = {"Authorization": f"Bearer {credentials.token}"}
            params = {"fields": "id,name,mimeType", "supportsAllDrives": "true"}
            with httpx.Client(timeout=15) as client:
                takes = client.get(
                    f"https://www.googleapis.com/drive/v3/files/{drive.takes_folder_id}",
                    headers=headers,
                    params=params,
                )
                projects = client.get(
                    f"https://www.googleapis.com/drive/v3/files/{drive.projects_folder_id}",
                    headers=headers,
                    params=params,
                )
            if takes.status_code >= 400 or projects.status_code >= 400:
                return Response({"ok": False, "error": "Não foi possível acessar uma das pastas configuradas."})
            if takes.json().get("mimeType") != "application/vnd.google-apps.folder" or projects.json().get("mimeType") != "application/vnd.google-apps.folder":
                return Response({"ok": False, "error": "As duas raízes informadas devem ser pastas do Google Drive."})
            return Response({"ok": True, "takes_folder": takes.json().get("name", ""), "projects_folder": projects.json().get("name", "")})
        except Exception:
            # A resposta é propositalmente genérica: detalhes de OAuth podem
            # carregar dados sensíveis da credencial ou da conta Google.
            return Response({"ok": False, "error": "Não foi possível autenticar no Google Drive."})
