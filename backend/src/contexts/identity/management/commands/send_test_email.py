"""Dispara um email de teste para conferir SMTP e template de verdade.

Existe porque nenhum teste automatizado prova que o Gmail aceita a conexão nem
que o HTML sobrevive ao cliente de email — isso só se descobre enviando.

    python manage.py send_test_email voce@gmail.com --kind reset
"""
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from contexts.identity.infrastructure.django.email_sender_impl import DjangoEmailSender
from shared.domain.errors import UpstreamError

KINDS = ("reset", "invite", "verify")


class Command(BaseCommand):
    help = "Envia um email transacional de exemplo para o endereço informado."

    def add_arguments(self, parser):
        parser.add_argument("to_email")
        parser.add_argument("--kind", choices=KINDS, default="reset")

    def handle(self, *args, **options):
        to_email = options["to_email"]
        kind = options["kind"]
        sender = DjangoEmailSender()

        backend = settings.EMAIL_BACKEND.rsplit(".", 1)[-1]
        self.stdout.write(f"Backend: {backend} · host={settings.EMAIL_HOST} · from={settings.DEFAULT_FROM_EMAIL}")
        if "console" in settings.EMAIL_BACKEND:
            self.stdout.write(
                self.style.WARNING(
                    "EMAIL_HOST_USER/PASSWORD vazios — o email vai só para o terminal."
                )
            )

        try:
            if kind == "reset":
                sender.send_password_reset(
                    to_email=to_email, full_name="Teste", token="token-de-teste"
                )
            elif kind == "invite":
                sender.send_invitation(
                    to_email=to_email,
                    workspace_name="T4E GROUP",
                    inviter_name="Wellington",
                    token="token-de-teste",
                    role="admin",
                )
            else:
                sender.send_verification(
                    to_email=to_email, full_name="Teste", token="token-de-teste"
                )
        except UpstreamError as exc:
            raise CommandError(f"SMTP recusou o envio: {exc.__cause__ or exc}") from exc

        self.stdout.write(self.style.SUCCESS(f"Email '{kind}' enviado para {to_email}."))
