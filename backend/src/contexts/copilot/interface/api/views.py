"""Views finas do contexto copilot."""
from rest_framework import status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from contexts.copilot.application.use_cases.analyze_document import AnalyzeDocument
from contexts.copilot.application.use_cases.create_tasks_from_analysis import (
    CreateTasksFromAnalysis,
)
from contexts.copilot.application.use_cases.ingest_document import IngestDocument
from contexts.copilot.domain.entities.document import Document
from contexts.copilot.infrastructure.anthropic_analyzer import AnthropicAnalyzer
from contexts.copilot.infrastructure.django.repositories_impl import (
    DjangoDocumentRepository,
    DjangoWorkspaceAccess,
)
from contexts.copilot.infrastructure.task_creator_impl import ProjectsTaskCreator
from contexts.copilot.infrastructure.text_extractors import DefaultTextExtractor
from contexts.copilot.interface.api.serializers import (
    AnalysisSerializer,
    CreateTasksSerializer,
    DocumentSerializer,
)
from shared.domain.errors import ValidationError


def _doc_dict(doc: Document) -> dict:
    return {
        "id": doc.id,
        "title": doc.title,
        "kind": doc.kind.value,
        "status": doc.status.value,
        "text_preview": doc.text[:400],
        "analysis": doc.analysis,
    }


class DocumentListCreateView(APIView):
    """Lista e importa documentos: /api/copilot/documents/.

    POST aceita JSON (texto colado) ou multipart (arquivo PDF/DOCX/áudio).
    """

    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get(self, request: Request) -> Response:
        workspace_id = request.query_params.get("workspace_id")
        if not workspace_id:
            return Response(
                {"error": "Informe o parâmetro workspace_id."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # Reaproveita o WorkspaceAccess via use case? Listagem simples checa acesso:
        repo = DjangoDocumentRepository()
        access = DjangoWorkspaceAccess()
        if not access.is_member(workspace_id=workspace_id, user_id=str(request.user.id)):
            return Response(
                {"error": "Você não tem acesso a este workspace."},
                status=status.HTTP_403_FORBIDDEN,
            )
        docs = repo.list_by_workspace(workspace_id=workspace_id)
        return Response(DocumentSerializer([_doc_dict(d) for d in docs], many=True).data)

    def post(self, request: Request) -> Response:
        workspace_id = request.data.get("workspace_id")
        if not workspace_id:
            raise ValidationError("Informe workspace_id.")
        title = request.data.get("title", "")
        kind = request.data.get("kind", "text")

        upload = request.FILES.get("file")
        content = upload.read() if upload else None
        filename = upload.name if upload else ""
        text = request.data.get("text")

        use_case = IngestDocument(
            DjangoDocumentRepository(),
            DefaultTextExtractor(),
            DjangoWorkspaceAccess(),
        )
        doc = use_case.execute(
            workspace_id=str(workspace_id),
            actor_id=str(request.user.id),
            title=title,
            kind=kind,
            text=text,
            content=content,
            filename=filename,
        )
        return Response(
            DocumentSerializer(_doc_dict(doc)).data, status=status.HTTP_201_CREATED
        )


class DocumentAnalyzeView(APIView):
    """Analisa um documento com a IA: POST /api/copilot/documents/<id>/analyze/."""

    permission_classes = [IsAuthenticated]

    def post(self, request: Request, document_id: str) -> Response:
        use_case = AnalyzeDocument(
            DjangoDocumentRepository(),
            AnthropicAnalyzer(),
            DjangoWorkspaceAccess(),
        )
        result = use_case.execute(
            document_id=str(document_id), actor_id=str(request.user.id)
        )
        return Response(AnalysisSerializer(result.to_dict()).data)


class DocumentCreateTasksView(APIView):
    """Cria cards a partir das tarefas selecionadas: .../create-tasks/."""

    permission_classes = [IsAuthenticated]

    def post(self, request: Request, document_id: str) -> Response:
        serializer = CreateTasksSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        use_case = CreateTasksFromAnalysis(ProjectsTaskCreator())
        created = use_case.execute(
            project_id=serializer.validated_data["project_id"],
            actor_id=str(request.user.id),
            tasks=serializer.validated_data["tasks"],
        )
        return Response(
            {"created": [{"id": c.id, "ref": c.ref, "title": c.title} for c in created]},
            status=status.HTTP_201_CREATED,
        )
