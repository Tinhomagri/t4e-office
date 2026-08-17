"""Ferramentas de Drive: buscar e ler documentos (ex.: transcrição de
reunião) — a base pra IA propor card a partir do conteúdo.

Só leitura: quem decide criar o card é o usuário, confirmando a proposta que
sai de `propose_actions` (já registrado pelo domínio `projects`).

Sem Google conectado, ou sem o escopo do Drive concedido (quem conectou antes
deste escopo existir), as ferramentas devolvem `connected: false` — nunca
estouram, para a IA explicar em vez de travar o chat.
"""
from __future__ import annotations

from contexts.copilot.infrastructure.agent.base import ReadOnlyProvider, tool
from contexts.google.application.use_cases.get_valid_credentials import (
    GetValidCredentials,
)
from contexts.google.application.use_cases.read_drive_document import (
    ReadDriveDocument,
)
from contexts.google.application.use_cases.search_drive_files import SearchDriveFiles
from contexts.google.infrastructure.django.drive_gateway_impl import (
    GoogleDriveGateway,
)
from contexts.google.infrastructure.django.oauth_provider_impl import (
    GoogleOAuthProvider,
)
from contexts.google.infrastructure.django.repositories_impl import (
    DjangoConnectionRepository,
)
from shared.domain.errors import ValidationError

_NOT_CONNECTED = {
    "connected": False,
    "message": "O usuário não tem o Drive acessível — conta Google não "
    "conectada, ou conectada antes do escopo do Drive existir (precisa "
    "reconectar em Integrações).",
}


class DriveProvider(ReadOnlyProvider):
    """Leitura do Google Drive do usuário que está conversando."""

    domain = "drive"

    def __init__(self, *, workspace_id: str, actor_id: str):
        self.workspace_id = workspace_id
        self.actor_id = actor_id

    def _credentials(self) -> GetValidCredentials:
        return GetValidCredentials(
            oauth_provider=GoogleOAuthProvider(),
            connection_repository=DjangoConnectionRepository(),
        )

    def read_tools(self) -> list[dict]:
        return [
            tool(
                "drive_search_files",
                "Busca arquivos no Drive do usuário por texto livre (nome ou "
                "conteúdo) — use para achar a transcrição de uma reunião antes "
                "de ler o conteúdo dela. Devolve id, nome, tipo e link; NÃO "
                "devolve o texto do arquivo (use drive_read_file para isso).",
                {
                    "query": {
                        "type": "string",
                        "description": "Texto de busca (ex.: nome do cliente, "
                        "\"transcrição\", data da reunião).",
                    },
                    "max_results": {"type": "integer"},
                },
                required=["query"],
            ),
            tool(
                "drive_read_file",
                "Lê o conteúdo em texto de um arquivo do Drive (Doc do Google "
                "ou arquivo de texto), pelo id devolvido por drive_search_files. "
                "Documento do Google Apps que não seja Doc de texto (planilha, "
                "apresentação) não é suportado.",
                {"file_id": {"type": "string"}},
                required=["file_id"],
            ),
        ]

    def execute_read(self, name: str, args: dict) -> dict:
        handler = getattr(self, f"_read_{name}", None)
        if handler is None:
            raise ValidationError(f"Ferramenta desconhecida: {name}")
        try:
            return handler(args or {})
        except Exception as exc:  # noqa: BLE001 — Google fora do ar não trava o chat
            return {**_NOT_CONNECTED, "detail": str(exc)}

    def _read_drive_search_files(self, args: dict) -> dict:
        query = str(args.get("query") or "").strip()
        if not query:
            raise ValidationError("Informe o texto de busca.")
        files = SearchDriveFiles(
            drive_gateway=GoogleDriveGateway(),
            get_valid_credentials=self._credentials(),
        ).execute(
            user_id=self.actor_id,
            query=query,
            max_results=int(args.get("max_results") or 10),
        )
        return {
            "connected": True,
            "files": [
                {
                    "id": f.file_id,
                    "name": f.name,
                    "mime_type": f.mime_type,
                    "modified_time": f.modified_time,
                    "link": f.web_view_link,
                }
                for f in files
            ],
        }

    def _read_drive_read_file(self, args: dict) -> dict:
        file_id = str(args.get("file_id") or "").strip()
        if not file_id:
            raise ValidationError("Informe o file_id.")
        text = ReadDriveDocument(
            drive_gateway=GoogleDriveGateway(),
            get_valid_credentials=self._credentials(),
        ).execute(user_id=self.actor_id, file_id=file_id)
        return {"connected": True, "text": text}
