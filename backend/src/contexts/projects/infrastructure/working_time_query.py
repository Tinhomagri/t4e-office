"""Tempo trabalhado de vários cards de uma vez: uma query de colunas
`is_working` e uma de histórico (status + pausa), sem N+1."""
from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable

from contexts.projects.domain.working_time import (
    CardEvent,
    WorkingTime,
    compute_working_time,
)
from contexts.projects.infrastructure.django.models import (
    CardHistoryModel,
    CardModel,
    WorkflowStatusModel,
)

TRACKED_FIELDS = ("status", "paused")


def working_slugs_by_project(project_ids: Iterable[str]) -> dict[str, set[str]]:
    slugs: dict[str, set[str]] = defaultdict(set)
    rows = WorkflowStatusModel.objects.filter(
        project_id__in=list(project_ids), is_working=True
    ).values_list("project_id", "slug")
    for project_id, slug in rows:
        slugs[str(project_id)].add(slug)
    return slugs


def working_time_for_cards(cards: Iterable[CardModel]) -> dict[str, WorkingTime]:
    """`WorkingTime` por id de card. Recebe os cards já carregados (precisa só
    de id, project_id, status e created_at)."""
    cards = list(cards)
    if not cards:
        return {}
    slugs = working_slugs_by_project({str(c.project_id) for c in cards})
    events: dict[str, list[CardEvent]] = defaultdict(list)
    history = CardHistoryModel.objects.filter(
        card_id__in=[c.id for c in cards], field__in=TRACKED_FIELDS
    ).values_list("card_id", "field", "old_value", "new_value", "created_at")
    for card_id, field, old, new, when in history:
        events[str(card_id)].append(
            CardEvent(when=when, field=field, old_value=old, new_value=new)
        )
    return {
        str(c.id): compute_working_time(
            created_at=c.created_at,
            current_status=c.status,
            events=events.get(str(c.id), []),
            working_slugs=slugs.get(str(c.project_id), set()),
        )
        for c in cards
    }


def working_time_fields(wt: WorkingTime | None) -> dict:
    """Campos que o front consome (`doing_since` mantém o nome antigo: início do
    trecho que está contando agora)."""
    if wt is None:
        return {"doing_since": None, "paused_at": None, "worked_seconds": 0}
    return {
        "doing_since": wt.running_since,
        "paused_at": wt.paused_at,
        "worked_seconds": wt.worked_seconds,
    }
