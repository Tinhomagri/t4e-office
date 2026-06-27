"""Views finas para cards."""
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from contexts.projects.application.use_cases.create_card import CreateCard
from contexts.projects.application.use_cases.list_cards import ListCards
from contexts.projects.application.use_cases.update_card import UpdateCard
from contexts.projects.domain.entities.card import Card
from contexts.projects.infrastructure.django.repositories_impl import (
    DjangoCardRepository,
    DjangoProjectRepository,
    DjangoWorkspaceAccess,
)
from contexts.projects.interface.api.serializers import (
    CardSerializer,
    CreateCardSerializer,
    UpdateCardSerializer,
)


def _card_dict(card: Card, project_key: str) -> dict:
    """Monta o payload público do card, incluindo o ref legível (KEY-num)."""
    return {
        "id": card.id,
        "ref": f"{project_key}-{card.number}",
        "project_id": card.project_id,
        "number": card.number,
        "title": card.title,
        "description": card.description,
        "status": card.status.value,
        "type": card.type.value,
        "priority": card.priority.value,
        "points": card.points,
        "assignee_id": card.assignee_id,
        "sprint_id": card.sprint_id,
        "order": card.order,
    }


def _deps():
    return (
        DjangoProjectRepository(),
        DjangoCardRepository(),
        DjangoWorkspaceAccess(),
    )


class CardListCreateView(APIView):
    """Lista e cria cards de um projeto: /api/projects/<project_id>/cards/."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses=CardSerializer(many=True))
    def get(self, request: Request, project_id: str) -> Response:
        projects, cards, access = _deps()
        use_case = ListCards(projects, cards, access)
        result = use_case.execute(project_id=project_id, actor_id=str(request.user.id))
        project = projects.get(project_id=project_id)
        data = CardSerializer(
            [_card_dict(c, project.key) for c in result], many=True
        ).data
        return Response(data)

    @extend_schema(request=CreateCardSerializer, responses=CardSerializer)
    def post(self, request: Request, project_id: str) -> Response:
        serializer = CreateCardSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        projects, cards, access = _deps()
        use_case = CreateCard(projects, cards, access)
        card = use_case.execute(
            project_id=project_id,
            actor_id=str(request.user.id),
            **serializer.validated_data,
        )
        project = projects.get(project_id=project_id)
        return Response(
            CardSerializer(_card_dict(card, project.key)).data,
            status=status.HTTP_201_CREATED,
        )


class CardDetailView(APIView):
    """Atualiza um card: PATCH /api/cards/<card_id>/."""

    permission_classes = [IsAuthenticated]

    @extend_schema(request=UpdateCardSerializer, responses=CardSerializer)
    def patch(self, request: Request, card_id: str) -> Response:
        serializer = UpdateCardSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        projects, cards, access = _deps()
        use_case = UpdateCard(projects, cards, access)
        card = use_case.execute(
            card_id=card_id,
            actor_id=str(request.user.id),
            **serializer.validated_data,
        )
        project = projects.get(project_id=card.project_id)
        return Response(CardSerializer(_card_dict(card, project.key)).data)
