"""Recalcula os trechos de tempo rastreado (backfill ou correção).

    python manage.py recalcular_tempo_rastreado [--card <id>]
"""
from django.core.management.base import BaseCommand

from contexts.agent_api.application.tracked_time import TRIGGER_FIELDS, rebuild_tracked_entries
from contexts.projects.infrastructure.django.models import CardHistoryModel


class Command(BaseCommand):
    help = "Recalcula TrackedTimeEntry a partir do histórico dos cards."

    def add_arguments(self, parser):
        parser.add_argument("--card", help="só este card")

    def handle(self, *args, card=None, **options):
        if card:
            ids = [card]
        else:
            ids = (
                CardHistoryModel.objects.filter(field__in=TRIGGER_FIELDS)
                .values_list("card_id", flat=True)
                .distinct()
            )
        total = 0
        for card_id in ids:
            rebuild_tracked_entries(card_id)
            total += 1
        self.stdout.write(self.style.SUCCESS(f"{total} cards recalculados."))
