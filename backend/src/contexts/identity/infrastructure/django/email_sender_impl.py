"""Implementação do EmailSender usando Django send_mail (Gmail SMTP)."""
from django.conf import settings
from django.core.mail import send_mail

from contexts.identity.domain.ports.email_sender import EmailSender


class DjangoEmailSender(EmailSender):
    def send_verification(self, *, to_email: str, full_name: str, token: str) -> None:
        verify_url = f"{settings.FRONTEND_URL}/verify-email?token={token}"
        subject = "Confirme seu cadastro no T4E Office"
        body = (
            f"Olá, {full_name}!\n\n"
            f"Clique no link abaixo para confirmar seu email (válido por 24h):\n\n"
            f"{verify_url}\n\n"
            f"Se não criou uma conta, ignore este email."
        )
        send_mail(
            subject=subject,
            message=body,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[to_email],
            fail_silently=False,
        )

    def send_invitation(
        self, *, to_email: str, workspace_name: str, inviter_name: str, token: str
    ) -> None:
        invite_url = f"{settings.FRONTEND_URL}/invite?token={token}"
        subject = f"Convite para o workspace {workspace_name} — T4E Office"
        body = (
            f"Olá!\n\n"
            f"{inviter_name} convidou você para o workspace \"{workspace_name}\" no T4E Office.\n\n"
            f"Para aceitar, acesse (crie sua conta com este mesmo email, se ainda não tiver):\n\n"
            f"{invite_url}\n\n"
            f"Se não esperava este convite, ignore este email."
        )
        send_mail(
            subject=subject,
            message=body,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[to_email],
            fail_silently=False,
        )

    def send_password_reset(self, *, to_email: str, full_name: str, token: str) -> None:
        reset_url = f"{settings.FRONTEND_URL}/reset-password?token={token}"
        subject = "Redefinição de senha — T4E Office"
        body = (
            f"Olá, {full_name}!\n\n"
            f"Recebemos uma solicitação para redefinir sua senha. "
            f"Clique no link abaixo (válido por 1h):\n\n"
            f"{reset_url}\n\n"
            f"Se não solicitou, ignore este email. Sua senha não será alterada."
        )
        send_mail(
            subject=subject,
            message=body,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[to_email],
            fail_silently=False,
        )
