"""Caso de uso: solicitar redefinição de senha."""
import secrets

from contexts.identity.domain.ports.email_sender import EmailSender


class RequestPasswordReset:
    """Gera token e envia email de reset. Silencia se email não existe (anti-enumeração)."""

    def __init__(self, email_sender: EmailSender):
        self.email_sender = email_sender

    def execute(self, *, email: str) -> None:
        from contexts.identity.infrastructure.django.models import (
            PasswordResetToken,
            UserModel,
        )

        user = UserModel.objects.filter(email=email.lower()).first()
        if not user:
            return  # não revela que o email não existe

        # invalida tokens anteriores do usuário
        PasswordResetToken.objects.filter(user=user).delete()

        token = secrets.token_urlsafe(32)
        PasswordResetToken.objects.create(user=user, token=token)
        self.email_sender.send_password_reset(
            to_email=user.email, full_name=user.full_name, token=token
        )
