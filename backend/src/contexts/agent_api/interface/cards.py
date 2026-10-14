"""GET /cards e /cards/{id}: tradução do card do Office para o vocabulário do
Leonardo (tipo, prioridade, origem, horas)."""
from __future__ import annotations

from django.db.models import IntegerField, OuterRef, Q, Subquery, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.request import Request
from rest_framework.response import Response

from contexts.agent_api.infrastructure.models import TrackedTimeEntryModel
from contexts.agent_api.interface.base import AgentAPIView
from contexts.agent_api.interface.formatting import dt, hours
from contexts.agent_api.interface.pagination import paginate, parse_datetime_param
from contexts.projects.domain.working_time import business_seconds_between
from contexts.projects.infrastructure.django.models import (
    CardModel,
    WorkflowStatusModel,
    WorklogModel,
)
from contexts.projects.infrastructure.working_time_query import working_time_for_cards
from shared.domain.errors import NotFoundError, ValidationError

# Tipos fora deste mapa (épico, marketing) não são trabalho de squad: ficam fora.
CARD_TYPE = {
    "feature": "feature",
    "spike": "feature",
    "bug": "bug",
    "support": "suporte",
    "improvement": "melhoria",
    "debt": "melhoria",
    "chore": "melhoria",
}
PRIORITY = {"low": "baixa", "medium": "media", "high": "alta", "urgent": "critica"}
CATEGORY = {"todo": "a_fazer", "in_progress": "em_andamento", "done": "concluido"}
# Cards que entram pelo board público ou pelo Chatwoot são pedido do cliente.
CLIENT_SOURCES = {"public_link", "conversations"}

STATUS_DOC = (
    "Slug da coluna do quadro. Varia por projeto (cada board define as suas). "
    "Para lógica genérica use `status_categoria`: a_fazer | em_andamento | concluido."
)


def origem(card: CardModel) -> str:
    if card.client_request is not None:
        return "pedido_cliente" if card.client_request else "interno"
    return "pedido_cliente" if card.source in CLIENT_SOURCES else "interno"


def _sum_by_card(model, field: str):
    """Soma por card em subquery — anotar com Sum direto multiplicaria as
    linhas quando as duas somas (rastreado + worklog) vêm juntas."""
    sub = (
        model.objects.filter(card_id=OuterRef("pk"))
        .values("card_id")
        .annotate(total=Sum(field))
        .values("total")[:1]
    )
    return Coalesce(Subquery(sub, output_field=IntegerField()), 0)


def _base_qs(workspace_ids):
    return (
        CardModel.objects.filter(
            project__workspace_id__in=workspace_ids, type__in=list(CARD_TYPE)
        )
        .annotate(
            tracked_seconds=_sum_by_card(TrackedTimeEntryModel, "segundos"),
            logged_seconds=_sum_by_card(WorklogModel, "time_seconds"),
        )
    )


def serialize_cards(cards: list[CardModel]) -> list[dict]:
    """Página inteira de uma vez: categorias e trecho aberto em lote."""
    project_ids = {c.project_id for c in cards}
    categories = {
        (pid, slug): cat
        for pid, slug, cat in WorkflowStatusModel.objects.filter(
            project_id__in=project_ids
        ).values_list("project_id", "slug", "category")
    }
    # Trecho rodando agora ainda não está em TrackedTimeEntry (só fechados).
    now = timezone.now()
    working = working_time_for_cards(cards)
    rows = []
    for c in cards:
        wt = working.get(str(c.id))
        open_seconds = (
            business_seconds_between(wt.running_since, now) if wt and wt.running_since else 0
        )
        rows.append(
            {
                "id": str(c.id),
                "titulo": c.title,
                "descricao": c.description,
                "tipo": CARD_TYPE[c.type],
                "status": c.status,
                "status_categoria": CATEGORY.get(categories.get((c.project_id, c.status))),
                "prioridade": PRIORITY.get(c.priority, "media"),
                "projeto_id": str(c.project_id),
                "sprint_id": str(c.sprint_id) if c.sprint_id else None,
                "responsavel_id": str(c.assignee_id) if c.assignee_id else None,
                "origem": origem(c),
                "horas_estimadas": hours(c.original_estimate_seconds),
                "horas_gastas": hours(c.tracked_seconds + open_seconds),
                "horas_apontadas": hours(c.logged_seconds),
                "bloqueado": c.blocked,
                "motivo_bloqueio": c.block_reason or None,
                "etiquetas": list(c.labels or []),
                "arquivado": c.archived_at is not None,
                "criado_em": dt(c.created_at),
                "atualizado_em": dt(c.updated_at),
                "concluido_em": dt(c.resolved_at),
            }
        )
    return rows


class CardsView(AgentAPIView):
    @extend_schema(
        parameters=[
            OpenApiParameter("projeto", str),
            OpenApiParameter("status", str, description=STATUS_DOC),
            OpenApiParameter("tipo", str, enum=sorted(set(CARD_TYPE.values()))),
            OpenApiParameter("bloqueado", bool),
            OpenApiParameter("responsavel", str),
            OpenApiParameter("concluido_desde", str, description="ISO 8601"),
            OpenApiParameter("updated_since", str, description="ISO 8601"),
            OpenApiParameter("limit", int),
            OpenApiParameter("cursor", str),
        ]
    )
    def get(self, request: Request):
        params = request.query_params
        qs = _base_qs(self.workspace_ids())
        if projeto := params.get("projeto"):
            qs = qs.filter(project_id=projeto)
        if status := params.get("status"):
            qs = qs.filter(status=status)
        if tipo := params.get("tipo"):
            office_types = [k for k, v in CARD_TYPE.items() if v == tipo]
            if not office_types:
                raise ValidationError("`tipo` deve ser feature, bug, suporte ou melhoria.")
            qs = qs.filter(type__in=office_types)
        if (bloqueado := params.get("bloqueado")) is not None:
            if bloqueado not in ("true", "false"):
                raise ValidationError("`bloqueado` deve ser true ou false.")
            qs = qs.filter(blocked=bloqueado == "true")
        if responsavel := params.get("responsavel"):
            qs = qs.filter(assignee_id=responsavel)
        if concluido := parse_datetime_param(request, "concluido_desde"):
            qs = qs.filter(Q(resolved_at__gte=concluido))
        return paginate(request, qs, serialize_cards)


class CardDetailView(AgentAPIView):
    def get(self, request: Request, card_id):
        card = _base_qs(self.workspace_ids()).filter(id=card_id).first()
        if card is None:
            raise NotFoundError("Card não encontrado.")
        return Response(serialize_cards([card])[0])
