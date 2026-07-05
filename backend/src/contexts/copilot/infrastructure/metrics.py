"""Registro e agregação de uso do Copiloto por workspace.

Alimenta o relatório de avaliação ("o Copiloto está sendo útil/usável?"): volume
de interações, cards gerados, adoção pela equipe, satisfação (👍/👎), tendência
vs. período anterior, usuários mais ativos e atividade recente.
"""
from __future__ import annotations

from datetime import timedelta

from django.db.models import Count, Q, Sum
from django.db.models.functions import TruncDate
from django.utils import timezone

from contexts.copilot.infrastructure.django.models import CopilotEventModel

_CARD_KINDS = ["cards", "agent_execute"]


def log_event(
    *,
    workspace_id: str,
    actor_id: str | None,
    kind: str,
    rating: int | None = None,
    count: int = 0,
) -> None:
    """Registra um evento de uso. Nunca deve quebrar o fluxo principal."""
    try:
        CopilotEventModel.objects.create(
            workspace_id=workspace_id,
            actor_id=actor_id,
            kind=kind,
            rating=rating,
            count=count,
        )
    except Exception:  # noqa: BLE001 — métrica é best-effort, não bloqueia o usuário
        pass


def _totals(qs) -> dict:
    """Agrega volumes principais de um queryset de eventos."""
    agg = qs.aggregate(
        chats=Count("id", filter=Q(kind="chat")),
        analyses=Count("id", filter=Q(kind="analyze")),
        cards=Sum("count", filter=Q(kind__in=_CARD_KINDS)),
        thumbs_up=Count("id", filter=Q(kind="rating", rating=1)),
        thumbs_down=Count("id", filter=Q(kind="rating", rating=-1)),
    )
    return {
        "chats": agg["chats"] or 0,
        "documents_analyzed": agg["analyses"] or 0,
        "cards_created": agg["cards"] or 0,
        "thumbs_up": agg["thumbs_up"] or 0,
        "thumbs_down": agg["thumbs_down"] or 0,
        "interactions": (agg["chats"] or 0) + (agg["analyses"] or 0),
    }


def _pct_delta(current: int, previous: int) -> int | None:
    """Variação percentual vs. período anterior (None se base zero)."""
    if not previous:
        return None
    return round(100 * (current - previous) / previous)


def _satisfaction(up: int, down: int) -> int | None:
    total = up + down
    return round(100 * up / total) if total else None


def summary(workspace_id: str, *, days: int = 30) -> dict:
    """Relatório completo dos últimos `days` dias, com tendência e adoção."""
    now = timezone.now()
    since = now - timedelta(days=days)
    prev_since = now - timedelta(days=2 * days)

    base = CopilotEventModel.objects.filter(workspace_id=workspace_id)
    qs = base.filter(created_at__gte=since)
    prev_qs = base.filter(created_at__gte=prev_since, created_at__lt=since)

    cur = _totals(qs)
    prev = _totals(prev_qs)

    active_users = qs.exclude(actor_id=None).values("actor_id").distinct().count()
    prev_active = prev_qs.exclude(actor_id=None).values("actor_id").distinct().count()

    # Série diária unificada (dias vazios preenchidos com 0) para os gráficos.
    rows = (
        qs.annotate(day=TruncDate("created_at"))
        .values("day", "kind")
        .annotate(n=Count("id"), c=Sum("count"))
    )
    by_day: dict = {}
    for r in rows:
        slot = by_day.setdefault(
            r["day"], {"chats": 0, "analyses": 0, "cards": 0}
        )
        if r["kind"] == "chat":
            slot["chats"] += r["n"]
        elif r["kind"] == "analyze":
            slot["analyses"] += r["n"]
        elif r["kind"] in _CARD_KINDS:
            slot["cards"] += r["c"] or 0

    start = since.date()
    end = now.date()
    series = []
    cursor = start
    while cursor <= end:
        slot = by_day.get(cursor, {"chats": 0, "analyses": 0, "cards": 0})
        series.append(
            {
                "day": cursor.isoformat(),
                "chats": slot["chats"],
                "analyses": slot["analyses"],
                "cards": slot["cards"],
                "interactions": slot["chats"] + slot["analyses"],
            }
        )
        cursor += timedelta(days=1)

    # Composição do uso por tipo de ação (para o donut).
    by_kind = [
        {"key": "chat", "label": "Conversas", "value": cur["chats"]},
        {"key": "analyze", "label": "Documentos", "value": cur["documents_analyzed"]},
        {"key": "cards", "label": "Cards gerados", "value": cur["cards_created"]},
    ]

    # Usuários mais ativos (adoção) — com nome resolvido.
    top = (
        qs.exclude(actor_id=None)
        .values("actor_id", "actor__full_name", "actor__email")
        .annotate(n=Count("id"))
        .order_by("-n")[:5]
    )
    top_users = [
        {
            "id": str(t["actor_id"]),
            "name": t["actor__full_name"] or t["actor__email"] or "Usuário",
            "count": t["n"],
        }
        for t in top
    ]

    # Atividade recente — feed dos últimos eventos relevantes.
    recent = (
        qs.exclude(kind="rating")
        .select_related("actor")
        .order_by("-created_at")[:12]
    )
    recent_feed = [
        {
            "kind": e.kind,
            "count": e.count,
            "actor": (e.actor.full_name or e.actor.email) if e.actor else "—",
            "at": e.created_at.isoformat(),
        }
        for e in recent
    ]

    return {
        "period_days": days,
        # Volumes atuais
        "chats": cur["chats"],
        "documents_analyzed": cur["documents_analyzed"],
        "cards_created": cur["cards_created"],
        "interactions": cur["interactions"],
        "active_users": active_users,
        "thumbs_up": cur["thumbs_up"],
        "thumbs_down": cur["thumbs_down"],
        "satisfaction": _satisfaction(cur["thumbs_up"], cur["thumbs_down"]),
        "total_ratings": cur["thumbs_up"] + cur["thumbs_down"],
        # Tendência vs. período anterior
        "trend": {
            "interactions": _pct_delta(cur["interactions"], prev["interactions"]),
            "cards_created": _pct_delta(cur["cards_created"], prev["cards_created"]),
            "active_users": _pct_delta(active_users, prev_active),
            "satisfaction_prev": _satisfaction(prev["thumbs_up"], prev["thumbs_down"]),
        },
        # Séries e listas
        "series": series,
        "by_kind": by_kind,
        "top_users": top_users,
        "recent": recent_feed,
    }
