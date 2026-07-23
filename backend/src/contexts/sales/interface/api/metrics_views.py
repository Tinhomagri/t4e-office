"""Métricas agregadas do funil comercial.

Leitura direta pelo ORM (não passa por use case) porque é relatório: o que
importa aqui é agregar muitos negócios em poucas queries, não aplicar regra de
negócio. Nada aqui escreve.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import timedelta
from decimal import Decimal

from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from contexts.sales.infrastructure.django.models import (
    DealActivityModel,
    DealModel,
    PipelineStageModel,
)
from contexts.sales.interface.api.permissions import assert_workspace_member
from contexts.sales.interface.api.views import _require_workspace, _uid

# Acima disso um negócio parado vira alerta na coluna.
STALE_DAYS = 14


def _owner_label(deal: DealModel) -> tuple[str | None, str]:
    if deal.owner_id is None:
        return None, "Sem dono"
    owner = deal.owner
    name = (getattr(owner, "full_name", "") or getattr(owner, "email", "")).strip()
    return str(deal.owner_id), name or "Sem nome"


class PipelineMetricsView(APIView):
    """GET indicadores do funil: por estágio, forecast, conversão e atrasos.

    Query: workspace_id (obrigatório), days (janela de ganhos/perdas, default 90).
    """

    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        workspace_id = _require_workspace(request)
        if not workspace_id:
            return Response(
                {"error": "Informe o parâmetro workspace_id."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        assert_workspace_member(workspace_id=workspace_id, user_id=_uid(request))

        try:
            days = max(1, min(int(request.query_params.get("days", 90)), 365))
        except (TypeError, ValueError):
            days = 90

        now = timezone.now()
        today = timezone.localdate()
        window_start = now - timedelta(days=days)

        stages = list(
            PipelineStageModel.objects.filter(workspace_id=workspace_id).order_by("order")
        )
        deals = list(
            DealModel.objects.filter(workspace_id=workspace_id).select_related(
                "stage", "owner", "customer"
            )
        )

        by_stage: dict[str, dict] = {
            str(s.id): {
                "stage_id": str(s.id),
                "name": s.name,
                "kind": s.kind,
                "color": s.color,
                "order": s.order,
                "count": 0,
                "total_amount": Decimal("0"),
                "weighted_amount": Decimal("0"),
                "stale_count": 0,
                "age_days_sum": 0,
            }
            for s in stages
        }

        by_owner: dict[str | None, dict] = {}
        open_total = Decimal("0")
        open_weighted = Decimal("0")
        open_count = 0
        won_count = 0
        lost_count = 0
        won_amount = Decimal("0")
        lost_amount = Decimal("0")
        won_cycle_days = 0
        # Forecast por mês de fechamento esperado — só negócios abertos.
        forecast: dict[str, dict[str, Decimal]] = defaultdict(
            lambda: {"amount": Decimal("0"), "weighted": Decimal("0")}
        )
        overdue_deals: list[dict] = []

        for deal in deals:
            bucket = by_stage.get(str(deal.stage_id))
            weighted = deal.amount * Decimal(deal.probability) / Decimal(100)
            age_days = (now - deal.updated_at).days

            if bucket is not None:
                bucket["count"] += 1
                bucket["total_amount"] += deal.amount
                bucket["weighted_amount"] += weighted
                bucket["age_days_sum"] += age_days
                if deal.stage.kind == "open" and age_days >= STALE_DAYS:
                    bucket["stale_count"] += 1

            owner_id, owner_name = _owner_label(deal)
            owner = by_owner.setdefault(
                owner_id,
                {
                    "owner_id": owner_id,
                    "name": owner_name,
                    "open_count": 0,
                    "open_amount": Decimal("0"),
                    "weighted_amount": Decimal("0"),
                    "won_count": 0,
                    "won_amount": Decimal("0"),
                },
            )

            kind = deal.stage.kind
            if kind == "open":
                open_count += 1
                open_total += deal.amount
                open_weighted += weighted
                owner["open_count"] += 1
                owner["open_amount"] += deal.amount
                owner["weighted_amount"] += weighted
                if deal.expected_close_date:
                    key = deal.expected_close_date.strftime("%Y-%m")
                    forecast[key]["amount"] += deal.amount
                    forecast[key]["weighted"] += weighted
                    if deal.expected_close_date < today:
                        overdue_deals.append(
                            {
                                "id": str(deal.id),
                                "title": deal.title,
                                "customer": deal.customer.name,
                                "amount": str(deal.amount),
                                "expected_close_date": deal.expected_close_date.isoformat(),
                                "days_overdue": (today - deal.expected_close_date).days,
                                "owner": owner_name,
                            }
                        )
            elif kind == "won" and deal.won_at and deal.won_at >= window_start:
                won_count += 1
                won_amount += deal.amount
                won_cycle_days += max((deal.won_at - deal.created_at).days, 0)
                owner["won_count"] += 1
                owner["won_amount"] += deal.amount
            elif kind == "lost" and deal.lost_at and deal.lost_at >= window_start:
                lost_count += 1
                lost_amount += deal.amount

        closed = won_count + lost_count
        win_rate = round(won_count / closed * 100, 1) if closed else 0.0
        avg_ticket = won_amount / won_count if won_count else Decimal("0")
        avg_cycle_days = round(won_cycle_days / won_count, 1) if won_count else 0.0

        stage_out = []
        for entry in sorted(by_stage.values(), key=lambda s: s["order"]):
            count = entry["count"]
            stage_out.append(
                {
                    **entry,
                    "total_amount": str(entry["total_amount"]),
                    "weighted_amount": str(entry["weighted_amount"]),
                    "avg_age_days": round(entry["age_days_sum"] / count, 1) if count else 0.0,
                }
            )
            stage_out[-1].pop("age_days_sum")

        # Tarefas em aberto que já passaram do prazo — o que trava o funil.
        overdue_activities = (
            DealActivityModel.objects.filter(
                deal__workspace_id=workspace_id,
                kind="task",
                done_at__isnull=True,
                due_date__lt=now,
            )
            .select_related("deal", "assignee")
            .order_by("due_date")[:20]
        )

        overdue_deals.sort(key=lambda d: d["days_overdue"], reverse=True)

        return Response(
            {
                "by_stage": stage_out,
                "open": {
                    "count": open_count,
                    "amount": str(open_total),
                    "weighted_amount": str(open_weighted),
                },
                "closed": {
                    "days": days,
                    "won_count": won_count,
                    "lost_count": lost_count,
                    "won_amount": str(won_amount),
                    "lost_amount": str(lost_amount),
                    "win_rate": win_rate,
                    "avg_ticket": str(avg_ticket),
                    "avg_cycle_days": avg_cycle_days,
                },
                "forecast": [
                    {
                        "month": month,
                        "amount": str(values["amount"]),
                        "weighted": str(values["weighted"]),
                    }
                    for month, values in sorted(forecast.items())
                ],
                "by_owner": sorted(
                    (
                        {
                            **owner,
                            "open_amount": str(owner["open_amount"]),
                            "weighted_amount": str(owner["weighted_amount"]),
                            "won_amount": str(owner["won_amount"]),
                        }
                        for owner in by_owner.values()
                    ),
                    key=lambda o: Decimal(o["weighted_amount"]),
                    reverse=True,
                ),
                "overdue_deals": overdue_deals[:20],
                "overdue_activities": [
                    {
                        "id": str(a.id),
                        "deal_id": str(a.deal_id),
                        "deal_title": a.deal.title,
                        "content": a.content[:160],
                        "due_date": a.due_date.isoformat() if a.due_date else None,
                        "assignee": (
                            getattr(a.assignee, "full_name", "")
                            or getattr(a.assignee, "email", "")
                            if a.assignee
                            else ""
                        ),
                    }
                    for a in overdue_activities
                ],
            }
        )
