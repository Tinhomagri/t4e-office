"""Pausar/retomar card em andamento: POST /api/cards/<id>/pause/ e /resume/.

A pausa é só uma entrada `paused` no histórico (`"1"` pausa, `""` retoma) — o
tempo trabalhado é derivado dele (`domain.working_time`). Card continua na
coluna; só para de contar. Idempotente: pausar o que já está pausado não grava
nada de novo (duplo clique não polui o histórico)."""
from django.utils import timezone
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from contexts.projects.infrastructure.django.models import CardHistoryModel, CardModel
from contexts.projects.infrastructure.working_time_query import (
    working_slugs_by_project,
    working_time_fields,
    working_time_for_cards,
)
from contexts.projects.interface.api.permissions import assert_card_edit
from shared.domain.errors import ValidationError

_WorkingTimeSerializer = inline_serializer(
    name="CardWorkingTime",
    fields={
        "doing_since": serializers.DateTimeField(allow_null=True),
        "paused_at": serializers.DateTimeField(allow_null=True),
        "worked_seconds": serializers.IntegerField(),
    },
)


def _set_paused(request: Request, card_id: str, *, paused: bool) -> Response:
    card = assert_card_edit(
        card_id=str(card_id), user_id=str(request.user.id), fields={"paused"}
    )
    working = working_slugs_by_project([str(card.project_id)]).get(str(card.project_id), set())
    if card.status not in working:
        raise ValidationError("Só dá pra pausar/retomar card que está em andamento.")

    current = working_time_for_cards([card])[str(card.id)]
    if (current.paused_at is not None) != paused:
        CardHistoryModel.objects.create(
            card=card,
            author_id=request.user.id,
            field="paused",
            old_value="" if paused else "1",
            new_value="1" if paused else "",
        )
        current = working_time_for_cards([card])[str(card.id)]
        # Horas do card mudaram: `updated_since` da API de agentes precisa ver.
        CardModel.objects.filter(id=card.id).update(updated_at=timezone.now())
    return Response(working_time_fields(current))


class CardPauseView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=None, responses=_WorkingTimeSerializer)
    def post(self, request: Request, card_id: str) -> Response:
        return _set_paused(request, card_id, paused=True)


class CardResumeView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=None, responses=_WorkingTimeSerializer)
    def post(self, request: Request, card_id: str) -> Response:
        return _set_paused(request, card_id, paused=False)
