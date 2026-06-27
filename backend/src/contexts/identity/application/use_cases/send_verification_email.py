"""Caso de uso: envio do email de verificação após cadastro."""
import secrets
from dataclasses import dataclass

from contexts.identity.domain.ports.email_sender import EmailSender


@dataclass
class SendVerificationEmailInput:
    user_id: str
    user_email: str
    full_name: str


class SendVerificationEmail:
    """Gera token, persiste e dispara email de verificação."""

    def __init__(self, email_sender: EmailSender):
        self.email_sender = email_sender

    def execute(self, *, user_id: str, user_email: str, full_name: str) -> str:
        """Retorna o token gerado (útil em testes)."""
        from contexts.identity.infrastructure.django.models import (
            EmailVerificationToken,
        )

        token = secrets.token_urlsafe(32)
        EmailVerificationToken.objects.create(user_id=user_id, token=token)
        self.email_sender.send_verification(
            to_email=user_email, full_name=full_name, token=token
        )
        return token
