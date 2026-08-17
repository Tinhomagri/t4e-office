"""Implementação do DriveGateway usando a Google Drive API."""
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from contexts.google.domain.entities.drive_file import DriveFile
from contexts.google.domain.ports.drive_gateway import (
    MAX_CONTENT_CHARS,
    DriveError,
    DriveGateway,
)

# Tipos que a Drive API exporta como texto puro via `files.export` — os
# demais (planilha, apresentação, PDF, áudio…) não têm exportação de texto
# equivalente e caem no `get_media` bruto (só funciona se já for texto).
_EXPORTABLE_AS_TEXT = "application/vnd.google-apps.document"


class GoogleDriveGateway(DriveGateway):
    """Busca e leitura de conteúdo no Drive via google-api-python-client."""

    @staticmethod
    def _service(access_token: str):
        creds = Credentials(token=access_token)
        return build("drive", "v3", credentials=creds, cache_discovery=False)

    def search_files(
        self, *, access_token: str, query: str, max_results: int = 10
    ) -> list[DriveFile]:
        # Aspas simples fecham a string da query da Drive API antes da hora —
        # escapa pra um texto de busca com aspas não virar sintaxe inválida.
        termo = query.replace("'", "\\'")
        try:
            service = self._service(access_token)
            result = (
                service.files()
                .list(
                    q=f"fullText contains '{termo}' and trashed = false",
                    orderBy="modifiedTime desc",
                    pageSize=max_results,
                    fields="files(id, name, mimeType, modifiedTime, webViewLink)",
                )
                .execute()
            )
        except HttpError as exc:
            raise DriveError(f"Erro ao buscar no Drive: {exc}") from exc

        return [
            DriveFile(
                file_id=f["id"],
                name=f.get("name", "(sem nome)"),
                mime_type=f.get("mimeType", ""),
                modified_time=f.get("modifiedTime", ""),
                web_view_link=f.get("webViewLink", ""),
            )
            for f in result.get("files", [])
        ]

    def read_text(self, *, access_token: str, file_id: str) -> str:
        try:
            service = self._service(access_token)
            meta = service.files().get(fileId=file_id, fields="mimeType").execute()
            mime = meta.get("mimeType", "")
            if mime == _EXPORTABLE_AS_TEXT:
                raw = service.files().export(
                    fileId=file_id, mimeType="text/plain"
                ).execute()
            else:
                raw = service.files().get_media(fileId=file_id).execute()
        except HttpError as exc:
            raise DriveError(f"Erro ao ler arquivo do Drive: {exc}") from exc

        text = raw.decode("utf-8", errors="replace") if isinstance(raw, bytes) else str(raw)
        return text[:MAX_CONTENT_CHARS]
