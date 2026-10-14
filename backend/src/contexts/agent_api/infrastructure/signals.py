"""Mantém os trechos rastreados em dia: toda entrada de histórico que mexe em
status/pausa/responsável recalcula os trechos daquele card."""
from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver

from contexts.agent_api.application.tracked_time import TRIGGER_FIELDS, rebuild_tracked_entries
from contexts.projects.infrastructure.django.models import CardHistoryModel


@receiver(post_save, sender=CardHistoryModel, dispatch_uid="agent_api_tracked_time")
def _on_history(sender, instance, created, **kwargs):
    if created and instance.field in TRIGGER_FIELDS:
        card_id = instance.card_id
        transaction.on_commit(lambda: rebuild_tracked_entries(card_id))
