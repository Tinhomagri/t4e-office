"""Materializa os trechos rastreados de um card (ver TrackedTimeEntryModel)."""
from __future__ import annotations

from django.db import transaction

from contexts.agent_api.infrastructure.models import TrackedTimeEntryModel
from contexts.identity.infrastructure.django.models import UserModel
from contexts.projects.infrastructure.django.models import CardModel
from contexts.projects.infrastructure.working_time_query import working_time_for_cards

# Mudanças no histórico que alteram os trechos.
TRIGGER_FIELDS = frozenset({"status", "paused", "assignee_id", "blocked"})


@transaction.atomic
def rebuild_tracked_entries(card_id) -> None:
    """Recalcula os trechos do card e sincroniza a tabela: upsert por
    (card, início) — o id de um trecho que não mudou continua o mesmo — e
    apaga trechos que deixaram de existir."""
    card = CardModel.objects.filter(id=card_id).first()
    if card is None:
        return
    wt = working_time_for_cards([card])[str(card.id)]
    valid_people = {
        str(pk)
        for pk in UserModel.objects.filter(
            id__in=[s.assignee_id for s in wt.segments if s.assignee_id]
        ).values_list("id", flat=True)
    }
    keep = []
    for seg in wt.segments:
        entry, _ = TrackedTimeEntryModel.objects.update_or_create(
            card=card,
            inicio=seg.start,
            defaults={
                "fim": seg.end,
                "segundos": seg.seconds,
                "pessoa_id": seg.assignee_id if seg.assignee_id in valid_people else None,
            },
        )
        keep.append(entry.id)
    TrackedTimeEntryModel.objects.filter(card=card).exclude(id__in=keep).delete()
