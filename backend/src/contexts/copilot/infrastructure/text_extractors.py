"""Extração de texto de arquivos: PDF (pypdf), DOCX (python-docx), áudio (Whisper)."""
import io
import tempfile

from contexts.copilot.domain.entities.document import DocumentKind
from contexts.copilot.domain.ports.text_extractor import TextExtractor
from shared.domain.errors import ValidationError


class DefaultTextExtractor(TextExtractor):
    """Despacha por tipo. Dependências importadas sob demanda (lazy)."""

    def extract(self, *, content: bytes, kind: DocumentKind, filename: str) -> str:
        if kind is DocumentKind.PDF:
            return self._pdf(content)
        if kind is DocumentKind.DOCX:
            return self._docx(content)
        if kind is DocumentKind.AUDIO:
            return self._audio(content, filename)
        # TEXT não passa por aqui (texto colado já vem pronto).
        return content.decode("utf-8", errors="ignore")

    def _pdf(self, content: bytes) -> str:
        try:
            from pypdf import PdfReader
        except ImportError as e:
            raise ValidationError(
                "Leitura de PDF indisponível: instale 'pypdf' no servidor."
            ) from e
        reader = PdfReader(io.BytesIO(content))
        return "\n".join((page.extract_text() or "") for page in reader.pages)

    def _docx(self, content: bytes) -> str:
        try:
            import docx  # python-docx
        except ImportError as e:
            raise ValidationError(
                "Leitura de DOCX indisponível: instale 'python-docx' no servidor."
            ) from e
        document = docx.Document(io.BytesIO(content))
        return "\n".join(p.text for p in document.paragraphs)

    def _audio(self, content: bytes, filename: str) -> str:
        # Transcrição local via faster-whisper (se instalado). Síncrono no MVP.
        try:
            from faster_whisper import WhisperModel
        except ImportError as e:
            raise ValidationError(
                "Transcrição de áudio indisponível: instale 'faster-whisper' no "
                "servidor (e ffmpeg) para habilitar."
            ) from e
        suffix = "." + filename.rsplit(".", 1)[-1] if "." in filename else ".m4a"
        with tempfile.NamedTemporaryFile(suffix=suffix) as tmp:
            tmp.write(content)
            tmp.flush()
            model = WhisperModel("base", device="cpu", compute_type="int8")
            segments, _ = model.transcribe(tmp.name)
            return " ".join(seg.text for seg in segments).strip()
