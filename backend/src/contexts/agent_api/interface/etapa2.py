"""Etapa 2: histórico de card, sprints (planejado × concluído) e pessoas."""
from __future__ import annotations

from collections import defaultdict

from django.db.models import F
from django.db.models.functions import Greatest
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.request import Request

from contexts.agent_api.application.sprint_summary import done_cards, planned_cards
from contexts.agent_api.interface.base import AgentAPIView
from contexts.agent_api.interface.formatting import day, dt
from contexts.agent_api.interface.pagination import paginate
from contexts.estimation.infrastructure.django.models import SquadMemberModel
from contexts.identity.infrastructure.django.models import MembershipModel
from contexts.projects.infrastructure.django.models import (
    CardHistoryModel,
    CardModel,
    SprintModel,
)
from shared.domain.errors import NotFoundError, ValidationError

# ── /cards/{id}/historico ─────────────────────────────────────────────────────

# Só mudanças de fluxo (o que os agentes acompanham), com nome em português.
HISTORY_FIELDS = {
    "status": "status",
    "assignee_id": "responsavel",
    "sprint_id": "sprint",
    "blocked": "bloqueado",
    "block_reason": "motivo_bloqueio",
    "paused": "pausado",
}
# Booleanos gravados como "1"/"" no histórico viram true/false.
BOOLEAN_FIELDS = {"blocked", "paused"}


def _history_value(field: str, value: str):
    if field in BOOLEAN_FIELDS:
        return bool(value)
    return value or None


class CardHistoricoView(AgentAPIView):
    @extend_schema(parameters=[OpenApiParameter("limit", int), OpenApiParameter("cursor", str)])
    def get(self, request: Request, card_id):
        exists = CardModel.objects.filter(
            id=card_id, project__workspace_id__in=self.workspace_ids()
        ).exists()
        if not exists:
            raise NotFoundError("Card não encontrado.")
        qs = CardHistoryModel.objects.filter(card_id=card_id, field__in=list(HISTORY_FIELDS))

        def serialize(rows):
            return [
                {
                    "id": str(h.id),
                    "campo": HISTORY_FIELDS[h.field],
                    "de": _history_value(h.field, h.old_value),
                    "para": _history_value(h.field, h.new_value),
                    "quando": dt(h.created_at),
                    "quem": str(h.author_id) if h.author_id else None,
                }
                for h in rows
            ]

        return paginate(request, qs, serialize, order_field="created_at")


# ── /sprints ──────────────────────────────────────────────────────────────────

SPRINT_STATUS = {"planned": "planejada", "active": "em_andamento", "closed": "encerrada"}
SPRINT_STATUS_IN = {v: k for k, v in SPRINT_STATUS.items()}


class SprintsView(AgentAPIView):
    @extend_schema(
        parameters=[
            OpenApiParameter("projeto", str),
            OpenApiParameter("status", str, enum=list(SPRINT_STATUS_IN)),
            OpenApiParameter("updated_since", str, description="ISO 8601"),
            OpenApiParameter("limit", int),
            OpenApiParameter("cursor", str),
        ]
    )
    def get(self, request: Request):
        qs = SprintModel.objects.filter(project__workspace_id__in=self.workspace_ids())
        if projeto := request.query_params.get("projeto"):
            qs = qs.filter(project_id=projeto)
        if status := request.query_params.get("status"):
            if status not in SPRINT_STATUS_IN:
                raise ValidationError("`status` deve ser planejada, em_andamento ou encerrada.")
            qs = qs.filter(status=SPRINT_STATUS_IN[status])

        def serialize(rows):
            planned = planned_cards(rows)
            out = []
            for s in rows:
                cards = planned.get(str(s.id), [])
                done = done_cards(s, cards)
                out.append(
                    {
                        "id": str(s.id),
                        "projeto_id": str(s.project_id),
                        "nome": s.name,
                        "inicio": day(s.start_date),
                        "fim": day(s.end_date),
                        "status": SPRINT_STATUS.get(s.status, s.status),
                        "cards_planejados": [str(c.id) for c in cards],
                        "cards_concluidos": [str(c.id) for c in done],
                        "atualizado_em": dt(s.updated_at),
                    }
                )
            return out

        return paginate(request, qs, serialize)


# ── /pessoas ──────────────────────────────────────────────────────────────────

ROLE = {"owner": "dono", "admin": "admin", "member": "membro"}


class PessoasView(AgentAPIView):
    """Membros dos workspaces do token. De propósito sem e-mail, telefone,
    endereço ou custo — custo de pessoa fica no Manager."""

    @extend_schema(
        parameters=[
            OpenApiParameter("updated_since", str, description="ISO 8601"),
            OpenApiParameter("limit", int),
            OpenApiParameter("cursor", str),
        ]
    )
    def get(self, request: Request):
        workspaces = self.workspace_ids()
        qs = (
            MembershipModel.objects.filter(workspace_id__in=workspaces)
            .select_related("user")
            # Muda o nome (user) ou o papel (membership): os dois contam.
            .annotate(atualizado=Greatest(F("updated_at"), F("user__updated_at")))
        )

        def serialize(rows):
            squads = defaultdict(list)
            for user_id, name in (
                SquadMemberModel.objects.filter(
                    user_id__in=[m.user_id for m in rows], squad__workspace_id__in=workspaces
                )
                .order_by("squad__name")
                .values_list("user_id", "squad__name")
            ):
                squads[user_id].append(name)
            return [
                {
                    "id": str(m.user_id),
                    "nome": m.user.full_name,
                    "squad": squads[m.user_id][0] if squads[m.user_id] else None,
                    "papel": ROLE.get(m.role, m.role),
                    "ativo": m.user.is_active,
                    "atualizado_em": dt(m.atualizado),
                }
                for m in rows
            ]

        return paginate(request, qs, serialize, order_field="atualizado")
