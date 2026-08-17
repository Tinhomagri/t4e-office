"""Porta de saída: acesso ao Google Drive (só leitura)."""
from abc import ABC, abstractmethod

from contexts.google.domain.entities.drive_file import DriveFile

# Tamanho do conteúdo devolvido pro Copiloto — documento inteiro estouraria o
# contexto da conversa; o modelo pede outro trecho/arquivo se precisar de mais.
MAX_CONTENT_CHARS = 20_000


class DriveError(Exception):
    """Falha ao falar com a Drive API (5xx, rate limit, arquivo sem permissão)."""


class DriveGateway(ABC):
    """Contrato de leitura no Drive do usuário."""

    @abstractmethod
    def search_files(
        self, *, access_token: str, query: str, max_results: int = 10
    ) -> list[DriveFile]:
        """Busca arquivos por nome/conteúdo (texto livre) que o usuário pode
        ver, do mais recente pro mais antigo."""

    @abstractmethod
    def read_text(self, *, access_token: str, file_id: str) -> str:
        """Conteúdo em texto puro do arquivo (Doc do Google exportado, ou
        arquivo de texto baixado direto), truncado em `MAX_CONTENT_CHARS`."""
