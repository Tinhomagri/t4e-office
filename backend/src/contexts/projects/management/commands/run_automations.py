"""
Management command: python manage.py run_automations

Executa todas as regras de automação cron cujo next_run_at <= now.
Deve ser chamado pelo cron do sistema (ex: a cada 15 minutos):
    */15 * * * * /app/venv/bin/python manage.py run_automations
"""
from datetime import datetime, timezone

from django.core.management.base import BaseCommand

from contexts.projects.infrastructure.django.models import AutomationRuleModel
from contexts.projects.interface.api.automation_engine import run_rule


class Command(BaseCommand):
    help = "Executa automações cron pendentes"

    def add_arguments(self, parser):
        parser.add_argument(
            "--rule-id",
            type=str,
            help="Executa uma regra específica pelo UUID (ignora next_run_at)",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Apenas lista regras que seriam executadas, sem aplicar ações",
        )

    def handle(self, *args, **options):
        now = datetime.now(tz=timezone.utc)
        rule_id = options.get("rule_id")
        dry_run = options.get("dry_run")

        if rule_id:
            rules = AutomationRuleModel.objects.filter(id=rule_id, enabled=True, trigger_type="cron")
        else:
            rules = (
                AutomationRuleModel.objects.filter(enabled=True, trigger_type="cron", next_run_at__lte=now)
                | AutomationRuleModel.objects.filter(enabled=True, trigger_type="cron", next_run_at__isnull=True)
            )

        count = 0
        for rule in rules:
            if dry_run:
                self.stdout.write(f"[DRY] {rule.name} ({rule.project.key})")
                continue
            log = run_rule(rule, triggered_by="cron")
            status = "OK" if not log.error else f"ERR: {log.error}"
            self.stdout.write(
                f"[{status}] {rule.name} — {log.cards_affected} cards afetados"
            )
            count += 1

        if not dry_run:
            self.stdout.write(self.style.SUCCESS(f"Concluído: {count} regra(s) executada(s)"))
