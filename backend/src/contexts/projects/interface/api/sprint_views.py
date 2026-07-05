"""Views finas para sprints."""
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from contexts.projects.application.use_cases.create_sprint import CreateSprint
from contexts.projects.application.use_cases.list_sprints import ListSprints
from contexts.projects.application.use_cases.update_sprint import UpdateSprint
from contexts.projects.domain.entities.sprint import Sprint
from contexts.projects.infrastructure.django.repositories_impl import (
    DjangoCardRepository,
    DjangoProjectRepository,
    DjangoSprintRepository,
    DjangoWorkspaceAccess,
)
from contexts.projects.interface.api.serializers import (
    CreateSprintSerializer,
    SprintSerializer,
    UpdateSprintSerializer,
)


def _sprint_dict(sprint: Sprint) -> dict:
    """Monta o payload público da sprint."""
    return {
        "id": sprint.id,
        "project_id": sprint.project_id,
        "name": sprint.name,
        "goal": sprint.goal,
        "start_date": sprint.start_date,
        "end_date": sprint.end_date,
        "status": sprint.status.value,
        "started_at": sprint.started_at,
        "completed_at": sprint.completed_at,
    }


def _deps():
    return (
        DjangoProjectRepository(),
        DjangoSprintRepository(),
        DjangoWorkspaceAccess(),
    )


def _card_repo():
    return DjangoCardRepository()


class SprintListCreateView(APIView):
    """Lista e cria sprints: /api/projects/<project_id>/sprints/."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses=SprintSerializer(many=True))
    def get(self, request: Request, project_id: str) -> Response:
        projects, sprints, access = _deps()
        result = ListSprints(projects, sprints, access).execute(
            project_id=str(project_id), actor_id=str(request.user.id)
        )
        data = SprintSerializer([_sprint_dict(s) for s in result], many=True).data
        return Response(data)

    @extend_schema(request=CreateSprintSerializer, responses=SprintSerializer)
    def post(self, request: Request, project_id: str) -> Response:
        serializer = CreateSprintSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        projects, sprints, access = _deps()
        sprint = CreateSprint(projects, sprints, access).execute(
            project_id=str(project_id),
            actor_id=str(request.user.id),
            **serializer.validated_data,
        )
        return Response(
            SprintSerializer(_sprint_dict(sprint)).data,
            status=status.HTTP_201_CREATED,
        )


class SprintDetailView(APIView):
    """Atualiza uma sprint: PATCH /api/sprints/<sprint_id>/."""

    permission_classes = [IsAuthenticated]

    @extend_schema(request=UpdateSprintSerializer, responses=SprintSerializer)
    def patch(self, request: Request, sprint_id: str) -> Response:
        serializer = UpdateSprintSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        projects, sprints, access = _deps()
        sprint = UpdateSprint(projects, sprints, access, _card_repo()).execute(
            sprint_id=str(sprint_id),
            actor_id=str(request.user.id),
            **serializer.validated_data,
        )
        return Response(SprintSerializer(_sprint_dict(sprint)).data)
