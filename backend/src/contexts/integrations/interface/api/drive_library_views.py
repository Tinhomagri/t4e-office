"""Endpoints da biblioteca Drive: Takes e Projetos prontos."""
from __future__ import annotations

import httpx
from django.core import signing
from django.http import StreamingHttpResponse
from django.urls import reverse
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from contexts.copilot.infrastructure.django.repositories_impl import DjangoWorkspaceAccess
from contexts.integrations.infrastructure import drive_library
from shared.domain.errors import PermissionDeniedError, ValidationError
from shared.interface.permissions import SpaceAccessPermission


def _workspace_id(request: Request) -> str:
    value = request.query_params.get("workspace_id") or request.data.get("workspace_id")
    if not value:
        raise ValidationError("Informe o workspace_id.")
    return str(value)


def _member(request: Request, workspace_id: str) -> None:
    if not DjangoWorkspaceAccess().is_member(workspace_id=workspace_id, user_id=str(request.user.id)):
        raise PermissionDeniedError("Você não tem acesso a este workspace.")


def _stream_file(workspace_id: str, file_id: str, mode: str) -> StreamingHttpResponse:
    if mode not in {"preview", "download"}:
        raise ValidationError("Modo de arquivo inválido.")
    item = drive_library.assert_in_library(workspace_id, file_id)
    if item.get("mimeType", "").startswith("application/vnd.google-apps"):
        raise ValidationError("Este tipo de arquivo não possui prévia de mídia.")
    token = drive_library._token(workspace_id)
    client = httpx.Client(timeout=60)
    response = client.send(client.build_request("GET", f"https://www.googleapis.com/drive/v3/files/{file_id}", headers={"Authorization": f"Bearer {token}"}, params={"alt": "media", "supportsAllDrives": "true"}), stream=True)
    if response.status_code >= 400:
        response.close(); client.close()
        raise ValidationError("Não foi possível abrir o arquivo no Google Drive.")
    def stream():
        try:
            yield from response.iter_bytes()
        finally:
            response.close(); client.close()
    result = StreamingHttpResponse(stream(), content_type=item.get("mimeType") or "application/octet-stream")
    result["Content-Disposition"] = f'{"attachment" if mode == "download" else "inline"}; filename="{item.get("name", "arquivo")}"'
    return result


class DriveTakesView(APIView):
    permission_classes = [IsAuthenticated, SpaceAccessPermission]
    required_space = "marketing"

    def get(self, request: Request) -> Response:
        workspace_id = _workspace_id(request); _member(request, workspace_id)
        data = drive_library.list_takes(workspace_id, folder_id=request.query_params.get("folder_id", ""), search=request.query_params.get("search", ""), page_token=request.query_params.get("page_token", ""))
        return Response({"files": data.get("files", []), "next_page_token": data.get("nextPageToken")})

    def delete(self, request: Request, file_id: str) -> Response:
        workspace_id = _workspace_id(request); _member(request, workspace_id)
        drive_library.trash(workspace_id, file_id)
        return Response(status=204)


class DriveDaysView(APIView):
    permission_classes = [IsAuthenticated, SpaceAccessPermission]
    required_space = "marketing"

    def get(self, request: Request) -> Response:
        workspace_id = _workspace_id(request); _member(request, workspace_id)
        return Response({"days": drive_library.recording_days(workspace_id, request.query_params.get("month", ""))})


class DriveProjectsView(APIView):
    permission_classes = [IsAuthenticated, SpaceAccessPermission]
    required_space = "marketing"

    def get(self, request: Request) -> Response:
        workspace_id = _workspace_id(request); _member(request, workspace_id)
        data = drive_library.list_projects(workspace_id, search=request.query_params.get("search", ""), page_token=request.query_params.get("page_token", ""))
        return Response({"files": data.get("files", []), "next_page_token": data.get("nextPageToken")})


class DriveUploadSessionView(APIView):
    permission_classes = [IsAuthenticated, SpaceAccessPermission]
    required_space = "marketing"

    def post(self, request: Request, library: str) -> Response:
        workspace_id = _workspace_id(request); _member(request, workspace_id)
        name, mime_type = str(request.data.get("name") or ""), str(request.data.get("mime_type") or "")
        size = int(request.data.get("size") or 0)
        if library == "takes":
            parent_id = drive_library.ensure_day_folder(workspace_id, str(request.data.get("date") or ""))
        elif library == "projects":
            parent_id = drive_library.credentials_for_workspace(workspace_id).projects_folder_id
        else:
            raise ValidationError("Biblioteca inválida.")
        return Response({"upload_url": drive_library.start_upload(workspace_id, name=name, mime_type=mime_type, parent_id=parent_id, size=size), "parent_id": parent_id})


class DriveFileContentView(APIView):
    permission_classes = [IsAuthenticated, SpaceAccessPermission]
    required_space = "marketing"

    def get(self, request: Request, file_id: str, mode: str):
        workspace_id = _workspace_id(request); _member(request, workspace_id)
        return _stream_file(workspace_id, file_id, mode)


class DrivePublicUrlView(APIView):
    """URL temporária para a plataforma social buscar a mídia escolhida."""
    permission_classes = [IsAuthenticated, SpaceAccessPermission]
    required_space = "marketing"

    def post(self, request: Request, file_id: str) -> Response:
        workspace_id = _workspace_id(request); _member(request, workspace_id)
        drive_library.assert_in_library(workspace_id, file_id)
        token = signing.dumps({"workspace_id": workspace_id, "file_id": file_id}, salt="drive-public-media")
        path = reverse("integrations-drive-public-file", kwargs={"file_id": file_id})
        return Response({"url": request.build_absolute_uri(f"{path}?token={token}")})


class DrivePublicFileView(APIView):
    """Download público apenas com assinatura temporária, sem abrir o Drive."""
    permission_classes = [AllowAny]

    def get(self, request: Request, file_id: str):
        try:
            payload = signing.loads(request.query_params.get("token", ""), salt="drive-public-media", max_age=60 * 60 * 24 * 30)
        except signing.BadSignature:
            raise ValidationError("Link de mídia inválido ou expirado.") from None
        if payload.get("file_id") != file_id:
            raise ValidationError("Link de mídia inválido.")
        return _stream_file(str(payload["workspace_id"]), file_id, "preview")
