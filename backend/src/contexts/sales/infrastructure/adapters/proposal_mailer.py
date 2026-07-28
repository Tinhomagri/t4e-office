"""Envio da proposta por e-mail com o PDF anexo.

Reusa o SMTP já configurado no projeto (mesmo `DEFAULT_FROM_EMAIL` dos e-mails
de identidade), mas via `EmailMessage` porque `send_mail` não anexa arquivo.
"""
from __future__ import annotations

from django.conf import settings
from django.core.mail import EmailMessage

from contexts.sales.domain.entities.proposal import Proposal
from contexts.sales.infrastructure.adapters.proposal_pdf import format_money
from shared.domain.errors import UpstreamError


class DjangoProposalMailer:
    """Implementação do `ProposalMailer` sobre o backend de e-mail do Django."""

    def send(
        self,
        proposal: Proposal,
        *,
        to_email: str,
        pdf: bytes,
        filename: str,
        message: str = "",
    ) -> None:
        assunto = f"Proposta nº {proposal.number} — {proposal.title}"
        corpo = message.strip() or self._default_body(proposal)

        email = EmailMessage(
            subject=assunto,
            body=corpo,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[to_email],
        )
        email.attach(filename, pdf, "application/pdf")
        try:
            email.send(fail_silently=False)
        except OSError as exc:
            # SMTP fora do ar não é erro do usuário — vira 502, não 400.
            raise UpstreamError(
                f"Não foi possível enviar o e-mail da proposta: {exc}"
            ) from exc

    @staticmethod
    def _default_body(proposal: Proposal) -> str:
        linhas = [
            f"Olá{', ' + proposal.customer_name if proposal.customer_name else ''}!",
            "",
            f"Segue em anexo a proposta nº {proposal.number} — {proposal.title}.",
            f"Valor total: {format_money(proposal.total, proposal.currency)}.",
        ]
        if proposal.valid_until:
            linhas.append(f"Validade: {proposal.valid_until.strftime('%d/%m/%Y')}.")
        linhas += ["", "Qualquer dúvida, é só responder este e-mail.", "", "Equipe comercial"]
        return "\n".join(linhas)
