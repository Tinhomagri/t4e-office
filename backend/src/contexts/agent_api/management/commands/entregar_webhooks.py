"""Entrega os webhooks pendentes aos agentes.

    python manage.py entregar_webhooks            # uma rodada
    python manage.py entregar_webhooks --loop     # serviço contínuo (compose)
"""
import time

from django.core.management.base import BaseCommand

from contexts.agent_api.application.webhooks import deliver_pending


class Command(BaseCommand):
    help = "Entrega webhooks pendentes (outbox) com novas tentativas."

    def add_arguments(self, parser):
        parser.add_argument("--loop", action="store_true")
        parser.add_argument("--intervalo", type=int, default=5, help="segundos entre rodadas")

    def handle(self, *args, loop=False, intervalo=5, **options):
        while True:
            delivered = deliver_pending()
            if delivered or not loop:
                self.stdout.write(f"{delivered} webhooks entregues.")
            if not loop:
                return
            time.sleep(intervalo)
