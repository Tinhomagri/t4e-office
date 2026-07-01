"""Views finas para vínculos entre cards (issue links)."""
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from contexts.projects.application.use_cases.issue_links import (
    CreateIssueLink,
    DeleteIssueLink,
    ListIssueLinks,
)
from contexts.projects.infrastructure.django.repositories_impl import (
    DjangoCardRepository,
    DjangoIssueLinkRepository,
    DjangoProjectRepository,
    DjangoWorkspaceAccess,
)
from contexts.projects.interface.api.serializers import (
    CreateIssueLinkSerializer,
    IssueLinkSerializer,
)


def _deps():
    return (
        DjangoProjectRepository(),
        DjangoCardRepository(),
        DjangoIssueLinkRepository(),
        DjangoWorkspaceAccess(),
    )


def _link_payload(link, card_id, cards_repo, project_key) -> dict:
    """Monta payload na perspectiva do card observado (direção + outro card)."""
    if link.source_id == card_id:
        direction = "outgoing"
        other_id = link.target_id
    else:
        direction = "incoming"
        other_id = link.source_id
    other = cards_repo.get(card_id=other_id)
    return {
        "id": link.id,
        "link_type": link.link_type.value,
        "direction": direction,
        "other_card": {
            "id": other.id,
            "ref": f"{project_key}-{other.number}",
            "title": other.title,
            "status": other.status.value,
            "type": other.type.value,
        }
        if other
        else None,
    }


class CardLinkListCreateView(APIView):
    """Lista e cria vínculos de um card: /api/cards/<card_id>/links/."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses=IssueLinkSerializer(many=True))
    def get(self, request: Request, card_id: str) -> Response:
        projects, cards, links, access = _deps()
        result = ListIssueLinks(projects, cards, links, access).execute(
            card_id=str(card_id), actor_id=str(request.user.id)
        )
        card = cards.get(card_id=str(card_id))
        project = projects.get(project_id=card.project_id)
        data = [
            _link_payload(link, str(card_id), cards, project.key) for link in result
        ]
        return Response(IssueLinkSerializer(data, many=True).data)

    @extend_schema(request=CreateIssueLinkSerializer, responses=IssueLinkSerializer)
    def post(self, request: Request, card_id: str) -> Response:
        serializer = CreateIssueLinkSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        projects, cards, links, access = _deps()
        link = CreateIssueLink(projects, cards, links, access).execute(
            source_id=str(card_id),
            target_id=serializer.validated_data["target_id"],
            link_type=serializer.validated_data["link_type"],
            actor_id=str(request.user.id),
        )
        card = cards.get(card_id=str(card_id))
        project = projects.get(project_id=card.project_id)
        return Response(
            IssueLinkSerializer(
                _link_payload(link, str(card_id), cards, project.key)
            ).data,
            status=status.HTTP_201_CREATED,
        )


class IssueLinkDetailView(APIView):
    """Remove um vínculo: DELETE /api/links/<link_id>/."""

    permission_classes = [IsAuthenticated]

    def delete(self, request: Request, link_id: str) -> Response:
        projects, cards, links, access = _deps()
        DeleteIssueLink(projects, cards, links, access).execute(
            link_id=str(link_id), actor_id=str(request.user.id)
        )
        return Response(status=status.HTTP_204_NO_CONTENT)
