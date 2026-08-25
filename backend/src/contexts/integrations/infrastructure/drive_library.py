"""Cliente mínimo da API Google Drive para a biblioteca de mídia.

Não persiste access tokens: em cada operação o refresh token cifrado do
workspace é trocado em memória por um token curto.
"""
from __future__ import annotations

import json
from datetime import date
from typing import Any

import httpx
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2.credentials import Credentials

from contexts.integrations.infrastructure.drive_config import credentials_for_workspace
from shared.domain.errors import ValidationError

DRIVE_API = "https://www.googleapis.com/drive/v3"
UPLOAD_API = "https://www.googleapis.com/upload/drive/v3"
FOLDER_MIME = "application/vnd.google-apps.folder"
FIELDS = "id,name,mimeType,size,modifiedTime,createdTime,thumbnailLink,webViewLink,parents,description"


def _token(workspace_id: str) -> str:
    cfg = credentials_for_workspace(workspace_id)
    credentials = Credentials(
        token=None,
        refresh_token=cfg.refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=cfg.client_id,
        client_secret=cfg.client_secret,
        scopes=["https://www.googleapis.com/auth/drive"],
    )
    credentials.refresh(GoogleRequest())
    if not credentials.token:
        raise ValidationError("Não foi possível autenticar no Google Drive.")
    return credentials.token


def _headers(workspace_id: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {_token(workspace_id)}"}


def _raise(response: httpx.Response) -> None:
    if response.status_code >= 400:
        raise ValidationError("Não foi possível concluir a operação no Google Drive.")


def _get(workspace_id: str, file_id: str, *, fields: str = FIELDS) -> dict[str, Any]:
    response = httpx.get(
        f"{DRIVE_API}/files/{file_id}",
        headers=_headers(workspace_id),
        params={"fields": fields, "supportsAllDrives": "true"},
        timeout=30,
    )
    _raise(response)
    return response.json()


def _root_ids(workspace_id: str) -> set[str]:
    cfg = credentials_for_workspace(workspace_id)
    return {cfg.takes_folder_id, cfg.projects_folder_id}


def assert_in_library(workspace_id: str, file_id: str) -> dict[str, Any]:
    """Retorna metadados apenas quando o item descende de uma raiz configurada."""
    roots = _root_ids(workspace_id)
    current_id = file_id
    visited: set[str] = set()
    item: dict[str, Any] | None = None
    # Drive permite múltiplos pais; percorremos a primeira cadeia que encontra
    # uma das raízes, protegendo contra ciclos ou IDs externos maliciosos.
    for _ in range(24):
        if current_id in roots:
            return item or _get(workspace_id, current_id)
        if current_id in visited:
            break
        visited.add(current_id)
        item = _get(workspace_id, current_id)
        parents = item.get("parents") or []
        if any(parent in roots for parent in parents):
            return item
        if not parents:
            break
        current_id = parents[0]
    raise ValidationError("Arquivo não pertence à biblioteca deste workspace.")


def _items(workspace_id: str, parent_id: str, *, query: str = "", page_token: str = "") -> dict:
    q = [f"'{parent_id}' in parents", "trashed = false"]
    if query:
        escaped = query.replace("'", "\\'")
        q.append(f"name contains '{escaped}'")
    response = httpx.get(
        f"{DRIVE_API}/files",
        headers=_headers(workspace_id),
        params={
            "q": " and ".join(q), "fields": f"files({FIELDS}),nextPageToken",
            "pageSize": 100, "pageToken": page_token or None,
            "orderBy": "folder,name", "supportsAllDrives": "true", "includeItemsFromAllDrives": "true",
        },
        timeout=30,
    )
    _raise(response)
    return response.json()


def list_takes(workspace_id: str, *, folder_id: str = "", search: str = "", page_token: str = "") -> dict:
    cfg = credentials_for_workspace(workspace_id)
    parent = folder_id or cfg.takes_folder_id
    if folder_id:
        assert_in_library(workspace_id, folder_id)
    return _items(workspace_id, parent, query=search, page_token=page_token)


def list_projects(workspace_id: str, *, search: str = "", page_token: str = "") -> dict:
    return _items(workspace_id, credentials_for_workspace(workspace_id).projects_folder_id, query=search, page_token=page_token)


def recording_days(workspace_id: str, month: str = "") -> list[dict]:
    """Pastas de Takes nomeadas YYYY-MM-DD, como no t4e-os."""
    data = _items(workspace_id, credentials_for_workspace(workspace_id).takes_folder_id)
    prefix = f"{month}-" if month else ""
    return [item for item in data.get("files", []) if item.get("mimeType") == FOLDER_MIME and item.get("name", "").startswith(prefix)]


def ensure_day_folder(workspace_id: str, day: str) -> str:
    try:
        parsed = date.fromisoformat(day)
    except ValueError:
        raise ValidationError("date deve ser YYYY-MM-DD.") from None
    name = parsed.isoformat()
    root = credentials_for_workspace(workspace_id).takes_folder_id
    existing = _items(workspace_id, root, query=name).get("files", [])
    for item in existing:
        if item.get("name") == name and item.get("mimeType") == FOLDER_MIME:
            return item["id"]
    response = httpx.post(
        f"{DRIVE_API}/files", headers={**_headers(workspace_id), "Content-Type": "application/json"},
        params={"supportsAllDrives": "true"}, json={"name": name, "mimeType": FOLDER_MIME, "parents": [root]}, timeout=30,
    )
    _raise(response)
    return response.json()["id"]


def start_upload(workspace_id: str, *, name: str, mime_type: str, parent_id: str, size: int = 0) -> str:
    """Abre sessão resumível; o navegador envia os bytes direto ao Google."""
    if not name or not mime_type:
        raise ValidationError("Informe nome e tipo do arquivo.")
    response = httpx.post(
        f"{UPLOAD_API}/files",
        headers={**_headers(workspace_id), "Content-Type": "application/json", "X-Upload-Content-Type": mime_type, "X-Upload-Content-Length": str(max(size, 0))},
        params={"uploadType": "resumable", "supportsAllDrives": "true", "fields": FIELDS},
        content=json.dumps({"name": name, "mimeType": mime_type, "parents": [parent_id]}), timeout=30,
    )
    _raise(response)
    session_url = response.headers.get("location")
    if not session_url:
        raise ValidationError("O Google Drive não criou a sessão de upload.")
    return session_url


def trash(workspace_id: str, file_id: str) -> None:
    assert_in_library(workspace_id, file_id)
    response = httpx.patch(
        f"{DRIVE_API}/files/{file_id}", headers={**_headers(workspace_id), "Content-Type": "application/json"},
        params={"supportsAllDrives": "true"}, json={"trashed": True}, timeout=30,
    )
    _raise(response)
