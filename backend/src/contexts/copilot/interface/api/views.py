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
from contexts.copilot.infrastructure import ai_config, metrics, writing_skills
from contexts.copilot.infrastructure.django.repositories_impl import (
    DjangoDocumentRepository,
    DjangoWorkspaceAccess,
)
from contexts.copilot.infrastructure.task_creator_impl import ProjectsTaskCreator
from contexts.copilot.infrastructure.text_extractors import DefaultTextExtractor
from contexts.copilot.interface.api.serializers import (
    AgentExecuteSerializer,
    AiConfigSerializer,
    AiConfigWriteSerializer,
    AnalysisSerializer,
    ChatSerializer,
    CreateTasksSerializer,
    DocumentSerializer,
    WriteAssistSerializer,
)
from shared.domain.errors import NotFoundError, PermissionDeniedError, ValidationError


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
        repo = DjangoDocumentRepository()
        doc = repo.get(document_id=str(document_id))
        if doc is None:
            raise NotFoundError("Documento não encontrado.")
        # Constrói o analisador a partir da config de IA do workspace do documento.
        analyzer = ai_config.build_analyzer_for_workspace(doc.workspace_id)
        use_case = AnalyzeDocument(repo, analyzer, DjangoWorkspaceAccess())
        result = use_case.execute(
            document_id=str(document_id), actor_id=str(request.user.id)
        )
        metrics.log_event(
            workspace_id=doc.workspace_id,
            actor_id=str(request.user.id),
            kind="analyze",
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
        repo = DjangoDocumentRepository()
        doc = repo.get(document_id=str(document_id))
        if doc is not None:
            metrics.log_event(
                workspace_id=doc.workspace_id,
                actor_id=str(request.user.id),
                kind="cards",
                count=len(created),
            )
        return Response(
            {"created": [{"id": c.id, "ref": c.ref, "title": c.title} for c in created]},
            status=status.HTTP_201_CREATED,
        )


def _require_workspace_id(request: Request) -> str:
    workspace_id = request.query_params.get("workspace_id") or request.data.get("workspace_id")
    if not workspace_id:
        raise ValidationError("Informe workspace_id.")
    return str(workspace_id)


class AiConfigView(APIView):
    """Configuração de IA por workspace: GET (membros) / PUT (admin/owner).

    /api/copilot/ai-config/?workspace_id=...
    """

    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        workspace_id = _require_workspace_id(request)
        access = DjangoWorkspaceAccess()
        if not access.is_member(workspace_id=workspace_id, user_id=str(request.user.id)):
            raise PermissionDeniedError("Você não tem acesso a este workspace.")
        cfg = ai_config.get_config(workspace_id)
        data = ai_config.config_public_dict(cfg)
        data["can_edit"] = access.is_admin(workspace_id=workspace_id, user_id=str(request.user.id))
        return Response(AiConfigSerializer(data).data | {"can_edit": data["can_edit"]})

    def put(self, request: Request) -> Response:
        workspace_id = _require_workspace_id(request)
        access = DjangoWorkspaceAccess()
        if not access.is_admin(workspace_id=workspace_id, user_id=str(request.user.id)):
            raise PermissionDeniedError(
                "Apenas administradores do workspace podem configurar a IA."
            )
        serializer = AiConfigWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        v = serializer.validated_data
        cfg = ai_config.save_config(
            workspace_id=workspace_id,
            provider=v["provider"],
            model=v["model"],
            api_key=v["api_key"],
            is_active=v["is_active"],
            updated_by_id=str(request.user.id),
        )
        data = ai_config.config_public_dict(cfg)
        data["can_edit"] = True
        return Response(AiConfigSerializer(data).data | {"can_edit": True})


class CopilotChatView(APIView):
    """Chat conversacional com a IA do workspace: POST /api/copilot/chat/."""

    permission_classes = [IsAuthenticated]

    def post(self, request: Request) -> Response:
        serializer = ChatSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        workspace_id = str(serializer.validated_data["workspace_id"])
        access = DjangoWorkspaceAccess()
        if not access.is_member(workspace_id=workspace_id, user_id=str(request.user.id)):
            raise PermissionDeniedError("Você não tem acesso a este workspace.")
        messages = [dict(m) for m in serializer.validated_data["messages"]]
        result = ai_config.agent_chat_for_workspace(
            workspace_id,
            str(request.user.id),
            messages,
            space=serializer.validated_data["space"],
        )
        metrics.log_event(
            workspace_id=workspace_id, actor_id=str(request.user.id), kind="chat"
        )
        return Response(result)


class AgentExecuteView(APIView):
    """Executa as ações que a IA propôs, após confirmação do usuário.

    POST /api/copilot/agent/execute/ — body: {workspace_id, actions:[...]}.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request: Request) -> Response:
        serializer = AgentExecuteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        workspace_id = str(serializer.validated_data["workspace_id"])
        access = DjangoWorkspaceAccess()
        if not access.is_member(workspace_id=workspace_id, user_id=str(request.user.id)):
            raise PermissionDeniedError("Você não tem acesso a este workspace.")

        from contexts.copilot.infrastructure.agent.registry import AgentTools

        tools = AgentTools(workspace_id=workspace_id, actor_id=str(request.user.id))
        results = [
            tools.execute_write(a) for a in serializer.validated_data["actions"]
        ]
        applied = sum(1 for r in results if r.get("ok"))
        metrics.log_event(
            workspace_id=workspace_id,
            actor_id=str(request.user.id),
            kind="agent_execute",
            count=applied,
        )
        return Response({"results": results})


class CopilotMetricsView(APIView):
    """Painel de uso/avaliação do Copiloto: GET .../metrics/?workspace_id=..."""

    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        workspace_id = _require_workspace_id(request)
        access = DjangoWorkspaceAccess()
        if not access.is_member(workspace_id=workspace_id, user_id=str(request.user.id)):
            raise PermissionDeniedError("Você não tem acesso a este workspace.")
        return Response(metrics.summary(workspace_id))


class CopilotFeedbackView(APIView):
    """Avaliação de uma resposta da IA (👍/👎): POST .../feedback/."""

    permission_classes = [IsAuthenticated]

    def post(self, request: Request) -> Response:
        workspace_id = _require_workspace_id(request)
        access = DjangoWorkspaceAccess()
        if not access.is_member(workspace_id=workspace_id, user_id=str(request.user.id)):
            raise PermissionDeniedError("Você não tem acesso a este workspace.")
        rating = 1 if request.data.get("rating") in (1, "1", "up", True) else -1
        metrics.log_event(
            workspace_id=workspace_id,
            actor_id=str(request.user.id),
            kind="rating",
            rating=rating,
        )
        return Response({"ok": True}, status=status.HTTP_201_CREATED)


class AiConfigTestView(APIView):
    """Valida a chave configurada com uma chamada mínima: POST .../ai-config/test/."""

    permission_classes = [IsAuthenticated]

    def post(self, request: Request) -> Response:
        workspace_id = _require_workspace_id(request)
        access = DjangoWorkspaceAccess()
        if not access.is_admin(workspace_id=workspace_id, user_id=str(request.user.id)):
            raise PermissionDeniedError(
                "Apenas administradores do workspace podem testar a IA."
            )
        analyzer = ai_config.build_analyzer_for_workspace(workspace_id)
        try:
            analyzer.analyze(
                text="Reunião de teste: validar a conexão com a IA. Ação: confirmar integração."
            )
        except ValidationError:
            raise
        except Exception as exc:  # noqa: BLE001 — devolve erro do provedor de forma amigável
            return Response(
                {"ok": False, "error": f"Falha ao conectar com o provedor: {exc}"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response({"ok": True})


class WriteAssistView(APIView):
    """Reescreve texto de descrição/comentário com a IA: POST /api/copilot/write-assist/."""

    permission_classes = [IsAuthenticated]

    def post(self, request: Request) -> Response:
        serializer = WriteAssistSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        v = serializer.validated_data
        workspace_id = str(v["workspace_id"])
        access = DjangoWorkspaceAccess()
        if not access.is_member(workspace_id=workspace_id, user_id=str(request.user.id)):
            raise PermissionDeniedError("Você não tem acesso a este workspace.")

        result = writing_skills.rewrite(
            workspace_id=workspace_id,
            text=v["text"],
            action=v["action"],
            instruction=v.get("instruction", ""),
            target=v.get("target", ""),
        )
        metrics.log_event(
            workspace_id=workspace_id, actor_id=str(request.user.id), kind="write_assist"
        )
        return Response({"text": result})
