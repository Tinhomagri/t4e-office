"""Porta de saída: extração de texto de arquivos (PDF, DOCX, áudio)."""
from abc import ABC, abstractmethod

from contexts.copilot.domain.entities.document import DocumentKind


class TextExtractor(ABC):
    """Contrato para extrair texto de bytes de um arquivo conforme o tipo."""

    @abstractmethod
    def extract(self, *, content: bytes, kind: DocumentKind, filename: str) -> str:
        """Extrai e retorna o texto do arquivo."""
