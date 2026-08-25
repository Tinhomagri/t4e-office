"""Configuração segura da biblioteca Google Drive por workspace."""
from __future__ import annotations

import httpx
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2.credentials import Credentials
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from contexts.copilot.infrastructure.django.repositories_impl import DjangoWorkspaceAccess
from contexts.integrations.infrastructure.drive_config import (
    credentials_for_workspace,
    get_config,
    public_config,
    save_config,
)
from shared.domain.errors import PermissionDeniedError, ValidationError
from shared.interface.permissions import SpaceAccessPermission


def _require_owner(request: Request, workspace_id: str) -> None:
    if not workspace_id:
        raise ValidationError("Informe o workspace_id.")
    access = DjangoWorkspaceAccess()
    if access.role(workspace_id=workspace_id, user_id=str(request.user.id)) != "owner":
        raise PermissionDeniedError("Apenas o dono pode configurar o Google Drive.")


def _require_member(request: Request, workspace_id: str) -> bool:
    if not workspace_id:
        raise ValidationError("Informe o workspace_id.")
    role = DjangoWorkspaceAccess().role(workspace_id=workspace_id, user_id=str(request.user.id))
    if role is None:
        raise PermissionDeniedError("Você não tem acesso a este workspace.")
    return role == "owner"


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
        return Response(payload)

    def put(self, request: Request) -> Response:
        workspace_id = str(request.data.get("workspace_id") or "")
        _require_owner(request, workspace_id)
        cfg = save_config(
            workspace_id=workspace_id,
            actor_id=str(request.user.id),
            values=request.data,
            is_active=bool(request.data.get("is_active", True)),
        )
        return Response(public_config(cfg))


class DriveConfigTestView(APIView):
    """Testa token e permissões das duas raízes sem revelar segredo algum."""

    permission_classes = [IsAuthenticated, SpaceAccessPermission]
    required_space = "marketing"

    def post(self, request: Request) -> Response:
        workspace_id = str(request.data.get("workspace_id") or "")
        _require_owner(request, workspace_id)
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
