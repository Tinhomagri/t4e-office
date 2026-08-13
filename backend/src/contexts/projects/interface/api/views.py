"""Views finas do contexto projects."""
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from contexts.projects.application.use_cases.create_project import CreateProject
from contexts.projects.application.use_cases.list_projects import ListProjects
from contexts.projects.infrastructure.django.models import (
    ProjectModel,
    ProjectRoleMemberModel,
    ProjectRoleModel,
)
from contexts.projects.infrastructure.django.repositories_impl import (
    DjangoProjectRepository,
    DjangoWorkspaceAccess,
)
from contexts.projects.interface.api.capabilities import can_browse
from contexts.projects.interface.api.serializers import (
    CreateProjectSerializer,
    ProjectSerializer,
)


class ProjectListCreateView(APIView):
    """Lista e cria projetos dentro de um workspace."""

    permission_classes = [IsAuthenticated]

    @extend_schema(request=CreateProjectSerializer, responses=ProjectSerializer)
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
            template=serializer.validated_data.get("template", "software"),
        )
        # Acesso declarado na criação: squad dona + convidados avulsos. Fazer
        # isso aqui é o que evita o board nascer invisível e alguém ter de
        # descobrir a tela de permissões depois.
        dados = serializer.validated_data
        projeto = ProjectModel.objects.get(id=result.project_id)
        projeto.visibility = dados.get("visibility", "restricted")
        if dados.get("squad_id"):
            projeto.squad_id = dados["squad_id"]
        projeto.save(update_fields=["visibility", "squad"])

        convidados = [u for u in dados.get("member_ids", []) if u]
        if convidados:
            papel, _ = ProjectRoleModel.objects.get_or_create(
                project=projeto,
                slug="developer",
                defaults={"name": "Desenvolvedor"},
            )
            for user_id in convidados:
                ProjectRoleMemberModel.objects.get_or_create(role=papel, user_id=user_id)

        # Workflow inicial conforme o template (ex.: marketing → Briefing…Publicado)
        from contexts.projects.interface.api.extra_views import seed_workflow_statuses
        seed_workflow_statuses(result.project_id, result.template)
        return Response(
            ProjectSerializer(
                {
                    "id": result.project_id,
                    "name": result.name,
                    "key": result.key,
                    "workspace_id": result.workspace_id,
                    "template": result.template,
                    "squad_id": str(projeto.squad_id) if projeto.squad_id else None,
                    "visibility": projeto.visibility,
                }
            ).data,
            status=status.HTTP_201_CREATED,
        )

    @extend_schema(responses=ProjectSerializer(many=True))
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
        # Só os boards que a pessoa pode enxergar. O filtro mora aqui (interface)
        # e não no caso de uso, que é camada de aplicação e não conhece Django —
        # mas mora no SERVIDOR de qualquer forma: esconder no cliente não é
        # permissão, é maquiagem.
        user_id = str(request.user.id)
        modelos = {
            str(m.id): m
            for m in ProjectModel.objects.filter(id__in=[p.id for p in projects])
        }
        projects = [p for p in projects if can_browse(modelos[str(p.id)], user_id)]
        data = ProjectSerializer(
            [
                {
                    "id": p.id,
                    "name": p.name,
                    "key": p.key,
                    "workspace_id": p.workspace_id,
                    "template": p.template,
                    "squad_id": (
                        str(modelos[str(p.id)].squad_id)
                        if modelos[str(p.id)].squad_id
                        else None
                    ),
                    "visibility": modelos[str(p.id)].visibility,
                }
                for p in projects
            ],
            many=True,
        ).data
        return Response(data)
