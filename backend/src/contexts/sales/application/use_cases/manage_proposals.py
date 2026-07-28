"""Casos de uso das propostas comerciais."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from django.utils import timezone

from contexts.sales.domain.entities.proposal import Proposal, ProposalLineItem
from shared.domain.errors import NotFoundError, ValidationError


def _build_items(raw_items: list[dict]) -> list[ProposalLineItem]:
    """Converte o payload da tabela em entidades já validadas."""
    return [
        ProposalLineItem(
            id=None,
            description=str(raw.get("description", "")),
            quantity=Decimal(str(raw.get("quantity", "1"))),
            unit_price=Decimal(str(raw.get("unit_price", "0"))),
            position=index,
        )
        for index, raw in enumerate(raw_items)
    ]


@dataclass
class ListProposals:
    proposals: object

    def execute(self, *, workspace_id: str, deal_id: str | None = None) -> list[Proposal]:
        return self.proposals.list_for_workspace(workspace_id, deal_id=deal_id)


@dataclass
class GetProposal:
    proposals: object

    def execute(self, *, proposal_id: str) -> Proposal:
        return self.proposals.require(proposal_id)


@dataclass
class CreateProposal:
    """Cria a proposta a partir de um negócio do funil.

    O título e a moeda default vêm do negócio: retrabalho zero para quem só
    quer orçar o que já está no funil.
    """

    proposals: object
    deals: object

    def execute(
        self,
        *,
        workspace_id: str,
        deal_id: str,
        title: str = "",
        currency: str = "",
        intro: str = "",
        terms: str = "",
        valid_until: date | None = None,
        discount: Decimal = Decimal("0"),
        items: list[dict] | None = None,
        user_id: str | None = None,
    ) -> Proposal:
        deal = self.deals.filter(id=deal_id, workspace_id=workspace_id).first()
        if deal is None:
            raise NotFoundError("Negócio não encontrado neste workspace.")

        proposal = Proposal(
            id=None,
            workspace_id=workspace_id,
            deal_id=deal_id,
            title=title.strip() or deal.title,
            currency=(currency or deal.currency or "BRL"),
            intro=intro,
            terms=terms,
            valid_until=valid_until,
            discount=discount,
            items=_build_items(items or []),
            created_by_id=user_id,
        )
        return self.proposals.create(proposal)


@dataclass
class UpdateProposal:
    """Edita cabeçalho e/ou itens. Proposta decidida é documento — não muda."""

    proposals: object

    def execute(self, *, proposal_id: str, changes: dict) -> Proposal:
        proposal = self.proposals.require(proposal_id)
        proposal.assert_editable()

        if "items" in changes:
            items = _build_items(changes["items"])
        else:
            items = proposal.items

        # Reconstrói a entidade para revalidar as invariantes (inclusive
        # desconto × subtotal, que depende dos itens novos).
        updated = Proposal(
            id=proposal.id,
            workspace_id=proposal.workspace_id,
            deal_id=proposal.deal_id,
            title=changes.get("title", proposal.title),
            number=proposal.number,
            status=proposal.status,
            currency=changes.get("currency", proposal.currency),
            discount=Decimal(str(changes.get("discount", proposal.discount))),
            intro=changes.get("intro", proposal.intro),
            terms=changes.get("terms", proposal.terms),
            valid_until=changes.get("valid_until", proposal.valid_until),
            items=items,
            sent_at=proposal.sent_at,
            sent_to=proposal.sent_to,
            accepted_at=proposal.accepted_at,
            rejected_at=proposal.rejected_at,
            rejection_reason=proposal.rejection_reason,
            created_by_id=proposal.created_by_id,
        )
        self.proposals.update(updated)
        if "items" in changes:
            return self.proposals.replace_items(proposal_id, items)
        return self.proposals.require(proposal_id)


@dataclass
class DeleteProposal:
    proposals: object

    def execute(self, *, proposal_id: str) -> None:
        proposal = self.proposals.require(proposal_id)
        if proposal.status == "accepted":
            raise ValidationError(
                "Proposta aceita não pode ser excluída — ela é o registro do que foi contratado."
            )
        self.proposals.delete(proposal_id)


@dataclass
class RenderProposalPdf:
    """Gera o PDF sem enviar — o botão "baixar" da tela."""

    proposals: object
    renderer: object

    def execute(self, *, proposal_id: str, workspace_name: str = "") -> tuple[bytes, str]:
        proposal = self.proposals.require(proposal_id)
        pdf = self.renderer.render(proposal, workspace_name=workspace_name)
        return pdf, f"proposta-{proposal.number}.pdf"


@dataclass
class SendProposal:
    """Envia a proposta ao cliente com o PDF anexo.

    Só marca como enviada se o e-mail saiu: gravar `sent` antes e falhar no
    SMTP deixaria a tela dizendo que o cliente recebeu algo que nunca chegou.
    """

    proposals: object
    renderer: object
    mailer: object

    def execute(
        self,
        *,
        proposal_id: str,
        to_email: str,
        message: str = "",
        workspace_name: str = "",
    ) -> Proposal:
        proposal = self.proposals.require(proposal_id)
        proposal.assert_sendable()
        if not to_email.strip():
            raise ValidationError("Informe o e-mail do destinatário.")

        pdf = self.renderer.render(proposal, workspace_name=workspace_name)
        self.mailer.send(
            proposal,
            to_email=to_email.strip(),
            pdf=pdf,
            filename=f"proposta-{proposal.number}.pdf",
            message=message,
        )

        proposal.status = "sent"
        proposal.sent_at = timezone.now()
        proposal.sent_to = to_email.strip()
        return self.proposals.update(proposal)


@dataclass
class AcceptProposal:
    """Registra o aceite do cliente e SUGERE ganhar o negócio.

    Decisão de produto travada no brainstorming: não ganha o deal sozinho. O
    aceite chega por fora do sistema (e-mail, WhatsApp, telefone) e quem
    confirma é o vendedor — automatizar aqui moveria dinheiro no funil sem
    ninguém ter conferido.
    """

    proposals: object
    deals: object

    def execute(self, *, proposal_id: str) -> dict:
        proposal = self.proposals.require(proposal_id)
        proposal.assert_decidable()

        proposal.status = "accepted"
        proposal.accepted_at = timezone.now()
        saved = self.proposals.update(proposal)

        deal = self.deals.filter(id=saved.deal_id).first()
        already_won = bool(deal and deal.won_at)

        return {
            "proposal": saved,
            "suggestion": None
            if already_won
            else {
                "action": "win_deal",
                "deal_id": saved.deal_id,
                "deal_title": saved.deal_title,
                # O valor da proposta preenche o valor do negócio ao ganhar.
                "amount": str(saved.total),
                "currency": saved.currency,
            },
        }


@dataclass
class RejectProposal:
    proposals: object

    def execute(self, *, proposal_id: str, reason: str = "") -> Proposal:
        proposal = self.proposals.require(proposal_id)
        proposal.assert_decidable()
        proposal.status = "rejected"
        proposal.rejected_at = timezone.now()
        proposal.rejection_reason = reason.strip()[:200]
        return self.proposals.update(proposal)
