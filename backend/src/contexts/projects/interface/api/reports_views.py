"""Endpoint de relatórios ágeis: burndown, velocidade, CFD."""
from datetime import date, timedelta

from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from contexts.projects.domain.entities.card import CardResolution
from contexts.projects.infrastructure.django.models import CardModel, SprintModel
from contexts.projects.interface.api.permissions import assert_project_member


class ProjectReportsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request, project_id: str) -> Response:
        assert_project_member(project_id=str(project_id), user_id=str(request.user.id))
        sprints = list(
            SprintModel.objects.filter(project_id=project_id)
            .exclude(status="planned")
            .order_by("created_at")
        )
        cards = list(CardModel.objects.filter(project=project_id))

        return Response({
            "burndown": _burndown(sprints, cards),
            "velocity": _velocity(sprints, cards),
            "cfd": _cfd(cards),
        })


# ── Burndown ──────────────────────────────────────────────────────────────────

def _burndown(sprints: list, cards: list) -> dict:
    """Burndown da sprint ativa (ou última encerrada)."""
    sprint = next((s for s in reversed(sprints) if s.status == "active"), None)
    if not sprint:
        sprint = next((s for s in reversed(sprints) if s.status == "closed"), None)
    if not sprint or not sprint.start_date or not sprint.end_date:
        return {"sprint": None, "ideal": [], "actual": []}

    sprint_cards = [c for c in cards if str(c.sprint_id) == str(sprint.id)]
    total_pts = sum(c.points or 0 for c in sprint_cards)

    start = sprint.start_date
    end = sprint.end_date
    today = date.today()
    days = (end - start).days + 1

    ideal = []
    for i in range(days):
        d = start + timedelta(days=i)
        remaining = round(total_pts * (1 - i / max(days - 1, 1)), 1)
        ideal.append({"date": d.isoformat(), "points": remaining})

    # Actual: pontos entregues por dia. Conta por DESFECHO, não por coluna: um
    # card cancelado ("não será feito") está em Concluído mas não foi entregue, e
    # somá-lo achatava a linha como se a equipe tivesse produzido.
    # `resolved_at` é o instante real da entrega — `updated_at` mudava a cada
    # edição posterior e movia a entrega de dia.
    done_by_day: dict[str, float] = {}
    for c in sprint_cards:
        if not _is_delivered(c):
            continue
        when = c.resolved_at or c.updated_at
        if when is None:
            continue
        day = when.date().isoformat()
        done_by_day[day] = done_by_day.get(day, 0) + (c.points or 0)

    actual = []
    remaining = float(total_pts)
    for i in range(min(days, (today - start).days + 2)):
        d = start + timedelta(days=i)
        remaining -= done_by_day.get(d.isoformat(), 0)
        actual.append({"date": d.isoformat(), "points": max(0, round(remaining, 1))})

    return {
        "sprint": {"id": str(sprint.id), "name": sprint.name, "total_points": total_pts},
        "ideal": ideal,
        "actual": actual,
    }


def _is_delivered(card) -> bool:
    """O card conta como trabalho entregue?

    Preferimos o desfecho quando ele existe. Cards antigos sem desfecho caem no
    status — o backfill da migration 0023 cobre o histórico, mas um card criado
    fora do fluxo normal ainda pode chegar aqui sem `resolution`.
    """
    if card.resolution:
        return CardResolution(card.resolution).counts_as_delivered
    return card.status == "done"


# ── Velocidade ────────────────────────────────────────────────────────────────

def _velocity(sprints: list, cards: list) -> list:
    """Pontos entregues por sprint (últimas 8 sprints encerradas)."""
    closed = [s for s in sprints if s.status == "closed"][-8:]
    result = []
    for s in closed:
        pts = sum(
            c.points or 0
            for c in cards
            if str(c.sprint_id) == str(s.id) and _is_delivered(c)
        )
        committed = sum(c.points or 0 for c in cards if str(c.sprint_id) == str(s.id))
        result.append({
            "sprint": s.name,
            "committed": committed,
            "delivered": pts,
        })
    return result


# ── CFD — Cumulative Flow Diagram ─────────────────────────────────────────────

def _cfd(cards: list) -> list:
    """Distribuição de cards por status (snapshot atual)."""
    statuses = ["backlog", "todo", "doing", "review", "done"]
    counts = {s: 0 for s in statuses}
    for c in cards:
        if c.status in counts:
            counts[c.status] += 1
    return [{"status": s, "count": counts[s]} for s in statuses]
