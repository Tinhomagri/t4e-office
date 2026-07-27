"""Leituras agregadas do Planning Poker, sem passar pela camada HTTP.

Extraído de `interface/api/views.py` para servir dois consumidores: o endpoint
de resumo do workspace e a ferramenta `dlv_estimation_status` do Copiloto.

Não checa acesso — quem chama já resolveu workspace e permissão.
"""
from __future__ import annotations

from django.db.models import Avg
from django.utils import timezone

from contexts.estimation.infrastructure.django.models import (
    PokerRoundModel,
    PokerSessionModel,
)

# Valores válidos de pontuação final — mesmo deck usado na votação (sem "?").
DECK_POINTS = {1, 2, 3, 5, 8, 13, 21}


def round_dict(r: PokerRoundModel) -> dict:
    return {
        "id": str(r.id),
        "session_id": str(r.session_id),
        "card_id": str(r.card_id),
        "card_ref": r.card_ref,
        "card_title": r.card_title,
        "final_points": r.final_points,
        "votes": r.votes,
        "decided_by_name": r.decided_by.full_name if r.decided_by_id else "",
        "decided_at": r.decided_at.isoformat(),
    }


def workspace_summary(workspace_id: str) -> dict:
    """Resumo agregado das sessões de estimativa de um workspace."""
    sessions_qs = PokerSessionModel.objects.filter(workspace_id=workspace_id)
    rounds_qs = PokerRoundModel.objects.filter(
        session__workspace_id=workspace_id
    ).select_related("session", "decided_by")

    today = timezone.localdate()
    rounds_today = [
        r for r in rounds_qs if timezone.localtime(r.decided_at).date() == today
    ]
    sessions_today = [
        s for s in sessions_qs if timezone.localtime(s.created_at).date() == today
    ]

    avg = rounds_qs.aggregate(avg=Avg("final_points"))["avg"]

    distribution: dict[int, int] = {v: 0 for v in sorted(DECK_POINTS)}
    estimator_counts: dict[str, int] = {}
    for r in rounds_qs:
        distribution[r.final_points] = distribution.get(r.final_points, 0) + 1
        for v in r.votes:
            if v.get("value") is not None:
                name = v.get("participant_name") or "?"
                estimator_counts[name] = estimator_counts.get(name, 0) + 1

    top_estimators = sorted(
        estimator_counts.items(), key=lambda kv: kv[1], reverse=True
    )[:6]
    recent = sorted(rounds_qs, key=lambda r: r.decided_at, reverse=True)[:10]

    return {
        "sessions_total": sessions_qs.count(),
        "sessions_active": sessions_qs.exclude(status="done").count(),
        "sessions_today": len(sessions_today),
        "rounds_total": rounds_qs.count(),
        "rounds_today": len(rounds_today),
        "avg_points": round(avg, 1) if avg is not None else None,
        "points_distribution": [
            {"points": k, "count": v} for k, v in distribution.items()
        ],
        "top_estimators": [{"name": n, "votes": c} for n, c in top_estimators],
        "recent_rounds": [
            {**round_dict(r), "session_name": r.session.name} for r in recent
        ],
    }


def open_sessions(workspace_id: str) -> list[dict]:
    """Salas de estimativa ainda abertas — quem precisa entrar e votar."""
    sessions = PokerSessionModel.objects.filter(workspace_id=workspace_id).exclude(
        status="done"
    )
    return [
        {
            "id": str(s.id),
            "name": s.name,
            "status": s.status,
            "project_id": str(s.project_id) if s.project_id else None,
            "cards_in_session": len(s.card_ids or []),
            "created_at": s.created_at.isoformat(),
        }
        for s in sessions
    ]
