"""Views finas do contexto projects."""
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from contexts.projects.application.use_cases.create_project import CreateProject
from contexts.projects.application.use_cases.list_projects import ListProjects
from contexts.projects.infrastructure.django.repositories_impl import (
    DjangoProjectRepository,
    DjangoWorkspaceAccess,
)
from contexts.projects.interface.api.serializers import (
    CreateProjectSerializer,
    ProjectSerializer,
)


class ProjectListCreateView(APIView):
    """Lista e cria projetos dentro de um workspace."""

    permission_classes = [IsAuthenticated]

    def post(self, request: Request) -> Response:
        serializer = CreateProjectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        use_case = CreateProject(
            project_repository=DjangoProjectRepository(),
            workspace_access=DjangoWorkspaceAccess(),
        )
        result = use_case.execute(
            workspace_id=serializer.validated_data["workspace_id"],
            name=serializer.validated_data["name"],
            key=serializer.validated_data["key"],
            actor_id=str(request.user.id),
        )
        return Response(
            ProjectSerializer(
                {
                    "id": result.project_id,
                    "name": result.name,
                    "key": result.key,
                    "workspace_id": result.workspace_id,
                }
            ).data,
            status=status.HTTP_201_CREATED,
        )

    def get(self, request: Request) -> Response:
        # workspace_id obrigatório na query string
        workspace_id = request.query_params.get("workspace_id")
        if not workspace_id:
            return Response(
                {"error": "Informe o parâmetro workspace_id."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        use_case = ListProjects(
            project_repository=DjangoProjectRepository(),
            workspace_access=DjangoWorkspaceAccess(),
        )
        projects = use_case.execute(
            workspace_id=workspace_id, actor_id=str(request.user.id)
        )
        data = ProjectSerializer(
            [
                {
                    "id": p.id,
                    "name": p.name,
                    "key": p.key,
                    "workspace_id": p.workspace_id,
                }
                for p in projects
            ],
            many=True,
        ).data
        return Response(data)
