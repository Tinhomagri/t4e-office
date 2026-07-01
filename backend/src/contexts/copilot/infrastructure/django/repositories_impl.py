"""Implementações Django dos repositórios do contexto copilot."""
from contexts.copilot.domain.entities.document import (
    Document,
    DocumentKind,
    DocumentStatus,
)
from contexts.copilot.domain.repositories.document_repository import (
    DocumentRepository,
    WorkspaceAccess,
)
from contexts.copilot.infrastructure.django.models import DocumentModel
from contexts.identity.infrastructure.django.models import MembershipModel


def _to_entity(row: DocumentModel) -> Document:
    return Document(
        id=str(row.id),
        workspace_id=str(row.workspace_id),
        title=row.title,
        kind=DocumentKind(row.kind),
        text=row.text,
        status=DocumentStatus(row.status),
        analysis=row.analysis,
    )


class DjangoDocumentRepository(DocumentRepository):
    """Persistência de documentos via Django ORM."""

    def create(self, *, document: Document) -> Document:
        row = DocumentModel.objects.create(
            workspace_id=document.workspace_id,
            title=document.title,
            kind=document.kind.value,
            text=document.text,
            status=document.status.value,
            analysis=document.analysis,
        )
        return _to_entity(row)

    def get(self, *, document_id: str) -> Document | None:
        row = DocumentModel.objects.filter(id=document_id).first()
        return _to_entity(row) if row else None

    def list_by_workspace(self, *, workspace_id: str) -> list[Document]:
        rows = DocumentModel.objects.filter(workspace_id=workspace_id)
        return [_to_entity(r) for r in rows]

    def save(self, *, document: Document) -> Document:
        DocumentModel.objects.filter(id=document.id).update(
            title=document.title,
            status=document.status.value,
            analysis=document.analysis,
        )
        return document


class DjangoWorkspaceAccess(WorkspaceAccess):
    """Verifica acesso ao workspace consultando memberships do contexto identity."""

    def is_member(self, *, workspace_id: str, user_id: str) -> bool:
        return MembershipModel.objects.filter(
            workspace_id=workspace_id, user_id=user_id
        ).exists()
