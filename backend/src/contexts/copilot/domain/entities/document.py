"""Entidade de documento importado para análise — Python puro."""
from dataclasses import dataclass
from datetime import datetime
from enum import Enum

from shared.domain.errors import ValidationError


class DocumentKind(str, Enum):
    """Origem do conteúdo do documento."""

    TEXT = "text"  # texto colado (transcrição, ata)
    PDF = "pdf"
    DOCX = "docx"
    AUDIO = "audio"  # áudio transcrito via Whisper


class DocumentStatus(str, Enum):
    """Estado do documento no pipeline."""

    UPLOADED = "uploaded"  # texto extraído, ainda não analisado
    ANALYZED = "analyzed"
    FAILED = "failed"


@dataclass
class Document:
    """Documento importado, dono de seu texto extraído e (opcionalmente) análise."""

    id: str | None
    workspace_id: str
    title: str
    kind: DocumentKind
    text: str
    status: DocumentStatus = DocumentStatus.UPLOADED
    analysis: dict | None = None  # AnalysisResult serializado (preenchido na análise)
    project_id: str | None = None
    created_at: datetime | None = None  # preenchido pelo repositório na leitura/criação

    def __post_init__(self) -> None:
        if not self.text.strip():
            raise ValidationError("O documento não contém texto para analisar.")
