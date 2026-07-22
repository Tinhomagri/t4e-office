"""Worker da fila social: publica os posts agendados cujo horário chegou.

Deve ser chamado pelo cron do sistema (mesma abordagem de `run_automations`):
    * * * * * /app/.venv/bin/python manage.py publish_due_posts

Cada execução:
* pega os posts prontos (`status=scheduled`, `scheduled_at<=agora`, fora do
  backoff de retry);
* publica um a um via `publishing_service.try_publish` (retry/backoff embutido);
* nunca derruba a fila: falha de um post não afeta os demais.
"""
from django.core.management.base import BaseCommand

from contexts.integrations.infrastructure import publishing_service


class Command(BaseCommand):
    help = "Publica os posts sociais agendados cujo horário já chegou."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Lista os posts que seriam publicados, sem publicar.",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=50,
            help="Máximo de posts processados nesta execução (default 50).",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        posts = list(publishing_service.due_posts()[: options["limit"]])
        if not posts:
            self.stdout.write("Nenhum post pronto para publicar.")
            return

        published = failed = 0
        for post in posts:
            label = f"{post.account.channel} · {post.scheduled_at:%d/%m %H:%M} · {post.id}"
            if dry_run:
                self.stdout.write(f"[dry-run] publicaria: {label}")
                continue
            if publishing_service.try_publish(post):
                published += 1
                self.stdout.write(self.style.SUCCESS(f"✓ publicado: {label}"))
            else:
                failed += 1
                state = "falhou" if post.status == "failed" else f"retry #{post.attempts}"
                self.stdout.write(
                    self.style.WARNING(f"✗ {state}: {label} — {post.error[:120]}")
                )

        if not dry_run:
            self.stdout.write(
                self.style.SUCCESS(
                    f"Fila processada: {published} publicados, {failed} com falha/retry."
                )
            )
