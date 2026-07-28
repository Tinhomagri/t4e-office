"""Implementação do EmailSender: multipart texto + HTML, via SMTP do Django.

Todo email sai em duas partes. O corpo de texto não é decoração: cliente que
bloqueia HTML, leitor de tela e filtro de spam leem essa parte, e um email
só-HTML pontua pior na entrega. O HTML vem de template para que o visual fique
num arquivo editável e não concatenado em string Python.
"""
from urllib.parse import quote

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string

from contexts.identity.domain.ports.email_sender import EmailSender
from shared.domain.errors import UpstreamError

ROLE_LABELS = {
    "owner": "Proprietário",
    "admin": "Administrador",
    "member": "Membro",
    "viewer": "Visualizador",
}


def _frontend_url(path: str, token: str) -> str:
    """Monta o link do frontend com o token escapado.

    `quote` porque o token vem de `secrets.token_urlsafe`, que hoje só produz
    caracteres seguros — mas o escape protege caso a geração mude.
    """
    base = settings.FRONTEND_URL.rstrip("/")
    return f"{base}/{path.lstrip('/')}?token={quote(token, safe='')}"


def _send(*, to_email: str, subject: str, text_body: str, template: str, context: dict) -> None:
    message = EmailMultiAlternatives(
        subject=subject,
        body=text_body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[to_email],
    )
    message.attach_alternative(render_to_string(template, context), "text/html")
    try:
        message.send(fail_silently=False)
    except OSError as exc:
        # SMTPException herda de OSError. Vira 502 em vez de 500: o pedido do
        # cliente estava certo, quem falhou foi o servidor de email.
        raise UpstreamError("Não foi possível enviar o email agora.") from exc


class DjangoEmailSender(EmailSender):
    def send_verification(self, *, to_email: str, full_name: str, token: str) -> None:
        action_url = _frontend_url("verify-email", token)
        _send(
            to_email=to_email,
            subject="Confirme seu cadastro no T4E Office",
            text_body=(
                f"Olá, {full_name}!\n\n"
                f"Clique no link abaixo para confirmar seu email (válido por 24h):\n\n"
                f"{action_url}\n\n"
                f"Se não criou uma conta, ignore este email."
            ),
            template="identity/email/verification.html",
            context={"full_name": full_name, "action_url": action_url},
        )

    def send_password_reset(self, *, to_email: str, full_name: str, token: str) -> None:
        action_url = _frontend_url("reset-password", token)
        _send(
            to_email=to_email,
            subject="Redefinição de senha — T4E Office",
            text_body=(
                f"Olá, {full_name}!\n\n"
                f"Recebemos uma solicitação para redefinir sua senha. "
                f"Clique no link abaixo (válido por 1h):\n\n"
                f"{action_url}\n\n"
                f"Se não solicitou, ignore este email. Sua senha não será alterada."
            ),
            template="identity/email/password_reset.html",
            context={"full_name": full_name, "action_url": action_url},
        )

    def send_invitation(
        self,
        *,
        to_email: str,
        workspace_name: str,
        inviter_name: str,
        token: str,
        role: str = "",
    ) -> None:
        action_url = _frontend_url("invite", token)
        role_label = ROLE_LABELS.get(role, "")
        _send(
            to_email=to_email,
            subject=f"Convite para o workspace {workspace_name} — T4E Office",
            text_body=(
                f"Olá!\n\n"
                f'{inviter_name} convidou você para o workspace "{workspace_name}" '
                f"no T4E Office.\n\n"
                + (f"Seu acesso: {role_label}.\n\n" if role_label else "")
                + f"Para aceitar, acesse (use o email {to_email} ao entrar ou criar "
                f"sua conta):\n\n"
                f"{action_url}\n\n"
                f"Se não esperava este convite, ignore este email."
            ),
            template="identity/email/invitation.html",
            context={
                "to_email": to_email,
                "workspace_name": workspace_name,
                "inviter_name": inviter_name,
                "role_label": role_label,
                "action_url": action_url,
            },
        )
