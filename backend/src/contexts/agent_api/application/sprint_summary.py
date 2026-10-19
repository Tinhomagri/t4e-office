"""Sprint planejado × concluído, reconstruído pelo histórico de `sprint_id`.
Usado por `GET /sprints` e pelo webhook `sprint.encerrada`."""
from __future__ import annotations

from collections import defaultdict

from django.db.models import Q

from contexts.projects.infrastructure.django.models import (
    CardHistoryModel,
    CardModel,
    SprintModel,
)


def planned_cards(sprints: list[SprintModel]) -> dict[str, list[CardModel]]:
    """Cards que estavam em cada sprint no momento em que ela começou,
    reconstruído pelo histórico de `sprint_id` (o card pode ter saído depois,
    ex.: devolvido ao backlog no fechamento). Sprint não iniciada = cards
    que estão nela agora."""
    ids = [str(s.id) for s in sprints]
    events = defaultdict(list)  # card_id -> [(quando, de, para)]
    rows = CardHistoryModel.objects.filter(
        Q(old_value__in=ids) | Q(new_value__in=ids), field="sprint_id"
    ).values_list("card_id", "old_value", "new_value", "created_at")
    for card_id, old, new, when in rows:
        events[card_id].append((when, old, new))
    candidate_ids = set(events) | set(
        CardModel.objects.filter(sprint_id__in=ids).values_list("id", flat=True)
    )
    cards = {c.id: c for c in CardModel.objects.filter(id__in=candidate_ids)}

    planned: dict[str, list[CardModel]] = defaultdict(list)
    for sprint in sprints:
        sid = str(sprint.id)
        for card in cards.values():
            if sprint.started_at is None:
                member = str(card.sprint_id or "") == sid
            else:
                evs = sorted(events.get(card.id, []))
                # Sprint do card antes de qualquer evento = `de` do primeiro.
                current = evs[0][1] if evs else str(card.sprint_id or "")
                for when, _old, new in evs:
                    if when > sprint.started_at:
                        break
                    current = new
                member = current == sid
            if member:
                planned[sid].append(card)
    return planned


def done_cards(sprint: SprintModel, cards: list[CardModel]) -> list[CardModel]:
    """Planejados que foram entregues até o fechamento da sprint."""
    return [
        c
        for c in cards
        if c.resolved_at and (sprint.completed_at is None or c.resolved_at <= sprint.completed_at)
    ]
