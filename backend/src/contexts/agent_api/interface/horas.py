"""GET /horas: lançamentos de tempo de duas fontes, separadas por `fonte` para
o agente não somar a mesma hora duas vezes:

- `rastreado`: trechos automáticos (card em andamento e não pausado);
- `manual`: worklogs lançados à mão.
"""
from __future__ import annotations

from datetime import date

from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.request import Request

from contexts.agent_api.infrastructure.models import TrackedTimeEntryModel
from contexts.agent_api.interface.base import AgentAPIView
from contexts.agent_api.interface.formatting import day, hours
from contexts.agent_api.interface.pagination import paginate_rows
from contexts.projects.infrastructure.django.models import WorklogModel
from shared.domain.errors import ValidationError


def _date_param(request: Request, name: str) -> date | None:
    raw = request.query_params.get(name)
    if not raw:
        return None
    try:
        return date.fromisoformat(raw)
    except ValueError as exc:
        raise ValidationError(f"`{name}` precisa ser data AAAA-MM-DD.") from exc


class HorasView(AgentAPIView):
    @extend_schema(
        parameters=[
            OpenApiParameter("projeto", str),
            OpenApiParameter("pessoa", str),
            OpenApiParameter("de", str, description="AAAA-MM-DD"),
            OpenApiParameter("ate", str, description="AAAA-MM-DD"),
            OpenApiParameter("updated_since", str, description="ISO 8601"),
            OpenApiParameter("limit", int),
            OpenApiParameter("cursor", str),
        ]
    )
    def get(self, request: Request):
        params = request.query_params
        de, ate = _date_param(request, "de"), _date_param(request, "ate")
        workspaces = self.workspace_ids()
        tracked = TrackedTimeEntryModel.objects.filter(
            card__project__workspace_id__in=workspaces
        ).select_related("card")
        logged = WorklogModel.objects.filter(
            card__project__workspace_id__in=workspaces
        ).select_related("card")
        if projeto := params.get("projeto"):
            tracked = tracked.filter(card__project_id=projeto)
            logged = logged.filter(card__project_id=projeto)
        if pessoa := params.get("pessoa"):
            tracked = tracked.filter(pessoa_id=pessoa)
            logged = logged.filter(author_id=pessoa)
        # `__date` usa o fuso do Django (America/Sao_Paulo): dia local.
        if de:
            tracked = tracked.filter(inicio__date__gte=de)
            logged = logged.filter(started_at__date__gte=de)
        if ate:
            tracked = tracked.filter(inicio__date__lte=ate)
            logged = logged.filter(started_at__date__lte=ate)

        rows = [
            {
                "id": f"r_{t.id}",
                "pessoa_id": str(t.pessoa_id) if t.pessoa_id else None,
                "card_id": str(t.card_id),
                "projeto_id": str(t.card.project_id),
                "data": day(t.inicio),
                "horas": hours(t.segundos),
                "descricao": "",
                "fonte": "rastreado",
                "_ordem": (t.updated_at, f"r_{t.id}"),
            }
            for t in tracked
        ] + [
            {
                "id": f"m_{w.id}",
                "pessoa_id": str(w.author_id),
                "card_id": str(w.card_id),
                "projeto_id": str(w.card.project_id),
                "data": day(w.started_at),
                "horas": hours(w.time_seconds),
                "descricao": w.comment,
                "fonte": "manual",
                "_ordem": (w.updated_at, f"m_{w.id}"),
            }
            for w in logged
        ]
        return paginate_rows(request, rows)
