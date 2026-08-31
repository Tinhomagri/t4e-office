"""Caso de uso: importar um documento (texto colado ou arquivo) e extrair texto."""
from contexts.copilot.domain.entities.document import (
    Document,
    DocumentKind,
    DocumentStatus,
)
from contexts.copilot.domain.ports.text_extractor import TextExtractor
from contexts.copilot.domain.repositories.document_repository import (
    DocumentRepository,
    WorkspaceAccess,
)
from shared.domain.errors import PermissionDeniedError, ValidationError


class IngestDocument:
    """Cria um documento a partir de texto colado ou de um arquivo enviado."""

    def __init__(
        self,
        document_repository: DocumentRepository,
        text_extractor: TextExtractor,
        workspace_access: WorkspaceAccess,
    ):
        self.document_repository = document_repository
        self.text_extractor = text_extractor
        self.workspace_access = workspace_access

    def execute(
        self,
        *,
        workspace_id: str,
        actor_id: str,
        title: str,
        kind: str,
        text: str | None = None,
        content: bytes | None = None,
        filename: str = "",
        project_id: str | None = None,
    ) -> Document:
        if not self.workspace_access.is_member(
            workspace_id=workspace_id, user_id=actor_id
        ):
            raise PermissionDeniedError("Você não tem acesso a este workspace.")

        doc_kind = DocumentKind(kind)
        if doc_kind is DocumentKind.TEXT:
            extracted = (text or "").strip()
        else:
            if content is None:
                raise ValidationError("Arquivo ausente para este tipo de documento.")
            extracted = self.text_extractor.extract(
                content=content, kind=doc_kind, filename=filename
            )

        if not extracted.strip():
            raise ValidationError("Não foi possível extrair texto do documento.")

        document = Document(
            id=None,
            workspace_id=workspace_id,
            title=title or filename or "Documento",
            kind=doc_kind,
            text=extracted,
            status=DocumentStatus.UPLOADED,
            project_id=project_id,
        )
        return self.document_repository.create(document=document)
