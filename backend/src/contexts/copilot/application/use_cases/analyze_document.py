"""Caso de uso: analisar um documento com a IA e guardar o resultado."""
from contexts.copilot.domain.entities.analysis import AnalysisResult
from contexts.copilot.domain.entities.document import DocumentStatus
from contexts.copilot.domain.ports.ai_analyzer import AiAnalyzer
from contexts.copilot.domain.repositories.document_repository import (
    DocumentRepository,
    WorkspaceAccess,
)
from shared.domain.errors import NotFoundError, PermissionDeniedError


class AnalyzeDocument:
    """Roda a IA sobre o texto do documento e persiste a análise."""

    def __init__(
        self,
        document_repository: DocumentRepository,
        ai_analyzer: AiAnalyzer,
        workspace_access: WorkspaceAccess,
    ):
        self.document_repository = document_repository
        self.ai_analyzer = ai_analyzer
        self.workspace_access = workspace_access

    def execute(self, *, document_id: str, actor_id: str) -> AnalysisResult:
        document = self.document_repository.get(document_id=document_id)
        if document is None:
            raise NotFoundError("Documento não encontrado.")
        if not self.workspace_access.is_member(
            workspace_id=document.workspace_id, user_id=actor_id
        ):
            raise PermissionDeniedError("Você não tem acesso a este documento.")

        result = self.ai_analyzer.analyze(text=document.text)
        document.analysis = result.to_dict()
        document.status = DocumentStatus.ANALYZED
        self.document_repository.save(document=document)
        return result
