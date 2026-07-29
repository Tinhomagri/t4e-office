"""Portas de saída da proposta: gerar o PDF e entregar ao cliente.

O domínio não sabe que o PDF é ReportLab nem que o e-mail é SMTP. Isso deixa
os casos de uso testáveis sem gerar arquivo nem abrir conexão, e permitiu
trocar WeasyPrint por ReportLab sem tocar em regra de negócio.
"""
from typing import Protocol

from contexts.sales.domain.entities.proposal import Proposal


class ProposalRenderer(Protocol):
    """Transforma a proposta no PDF que o cliente recebe."""

    def render(self, proposal: Proposal, *, workspace_name: str = "") -> bytes:
        """Devolve o PDF pronto, em bytes."""
        ...


class ProposalMailer(Protocol):
    """Entrega a proposta ao cliente com o PDF anexo."""

    def send(
        self,
        proposal: Proposal,
        *,
        to_email: str,
        pdf: bytes,
        filename: str,
        message: str = "",
    ) -> None:
        ...
