"""Materializa os trechos rastreados de um card (ver TrackedTimeEntryModel)."""
from __future__ import annotations

import uuid
from datetime import UTC, datetime

from django.db import transaction

from contexts.agent_api.infrastructure.models import TrackedTimeEntryModel
from contexts.identity.infrastructure.django.models import UserModel
from contexts.projects.infrastructure.django.models import CardModel
from contexts.projects.infrastructure.working_time_query import working_time_for_cards

_NAMESPACE = uuid.UUID("6f1c2a52-5d1e-4b0e-9a4f-0e8f6b1d2c33")


def tracked_entry_id(card_id, start: datetime) -> uuid.UUID:
    """Id do trecho derivado de (card, início): o trecho aberto que `/horas`
    mostra e a linha gravada quando ele fecha têm o MESMO id — o agente que
    sincroniza por `updated_since` atualiza em vez de somar duas vezes."""
    return uuid.uuid5(_NAMESPACE, f"{card_id}|{start.astimezone(UTC).isoformat()}")


# Mudanças no histórico que alteram os trechos.
TRIGGER_FIELDS = frozenset({"status", "paused", "assignee_id", "blocked"})


@transaction.atomic
def rebuild_tracked_entries(card_id) -> None:
    """Recalcula os trechos do card e sincroniza a tabela: upsert pelo id
    derivado de (card, início) — trecho que não mudou mantém o id — e apaga
    trechos que deixaram de existir."""
    card = CardModel.objects.filter(id=card_id).first()
    if card is None:
        return
    wt = working_time_for_cards([card])[str(card.id)]
    valid_people = {
        str(pk)
        for pk in UserModel.objects.filter(
            id__in=[seg.assignee_id for seg in wt.segments if seg.assignee_id]
        ).values_list("id", flat=True)
    }
    # Trecho sem nenhum segundo de expediente (madrugada, fim de semana,
    # bloqueado logo ao entrar) não é hora trabalhada: não vira linha.
    segments = [seg for seg in wt.segments if seg.seconds > 0]
    keep = {tracked_entry_id(card.id, seg.start) for seg in segments}
    # Apaga primeiro: linha velha com outro id no mesmo início travaria o
    # upsert na unicidade (card, inicio).
    TrackedTimeEntryModel.objects.filter(card=card).exclude(id__in=keep).delete()
    for seg in segments:
        TrackedTimeEntryModel.objects.update_or_create(
            id=tracked_entry_id(card.id, seg.start),
            defaults={
                "card": card,
                "inicio": seg.start,
                "fim": seg.end,
                "segundos": seg.seconds,
                "pessoa_id": seg.assignee_id if seg.assignee_id in valid_people else None,
            },
        )
