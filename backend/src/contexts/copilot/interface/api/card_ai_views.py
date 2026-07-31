"""Sugestões da IA ancoradas num card — o "Melhorar tarefa" do Jira.

Uma view só, com o tipo de sugestão no corpo: as três variações leem o mesmo
card e checam a mesma permissão, e separá-las em três endpoints só triplicaria
o carregamento do card. Nada aqui grava — a resposta é sempre uma proposta que
a pessoa aceita item a item na UI.
"""
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from contexts.copilot.infrastructure import card_skills, metrics
from contexts.copilot.interface.api.serializers import CardSuggestSerializer
from contexts.projects.infrastructure.django.models import CardModel
from contexts.projects.infrastructure.django.repositories_impl import (
    DjangoWorkspaceAccess,
)
from shared.domain.errors import NotFoundError, PermissionDeniedError


def _card_payload(card: CardModel) -> dict:
    return {
        "title": card.title,
        "description": card.description,
        "type": card.type,
    }


class CardSuggestView(APIView):
    """POST /api/copilot/card-suggest/ — body: {card_id, kind}."""

    permission_classes = [IsAuthenticated]

    def post(self, request: Request) -> Response:
        serializer = CardSuggestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        card_id = str(serializer.validated_data["card_id"])
        kind = serializer.validated_data["kind"]

        card = (
            CardModel.objects.filter(id=card_id)
            .select_related("project")
            .first()
        )
        if card is None:
            raise NotFoundError("Card não encontrado.")

        workspace_id = str(card.project.workspace_id)
        actor_id = str(request.user.id)
        if not DjangoWorkspaceAccess().is_member(
            workspace_id=workspace_id, user_id=actor_id
        ):
            raise PermissionDeniedError("Você não tem acesso a este card.")

        payload = _card_payload(card)
        if kind == "subtasks":
            data = {
                "subtasks": card_skills.suggest_subtasks(
                    workspace_id=workspace_id, card=payload
                )
            }
        elif kind == "similar":
            data = {
                "similar": card_skills.suggest_similar(
                    workspace_id=workspace_id,
                    card=payload,
                    candidates=self._candidates(card),
                )
            }
        else:
            data = {
                "replies": card_skills.suggest_replies(
                    workspace_id=workspace_id,
                    card=payload,
                    comments=self._comments(card),
                )
            }

        metrics.log_event(
            workspace_id=workspace_id, actor_id=actor_id, kind=f"card_suggest_{kind}"
        )
        return Response(data)

    def _candidates(self, card: CardModel) -> list[dict]:
        """Cards do mesmo projeto elegíveis a vínculo.

        Exclui o próprio card, os já vinculados (em qualquer direção) e os
        arquivados — sugerir o que já está lá só gasta o tempo de quem lê.
        """
        linked = set(card.links_out.values_list("target_id", flat=True)) | set(
            card.links_in.values_list("source_id", flat=True)
        )
        rows = (
            CardModel.objects.filter(
                project_id=card.project_id, archived_at__isnull=True
            )
            .exclude(id=card.id)
            .exclude(id__in=linked)
            .order_by("-updated_at")
            .values("id", "number", "title")[: card_skills.SIMILAR_POOL]
        )
        key = card.project.key
        return [
            {"id": str(r["id"]), "ref": f"{key}-{r['number']}", "title": r["title"]}
            for r in rows
        ]

    def _comments(self, card: CardModel) -> list[dict]:
        rows = (
            card.comments.select_related("author")
            .order_by("created_at")
            .values_list("author__full_name", "body")[:20]
        )
        return [{"author": author, "body": body} for author, body in rows]
