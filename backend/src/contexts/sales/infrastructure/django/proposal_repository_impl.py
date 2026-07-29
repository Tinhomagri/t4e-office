"""Persistência das propostas comerciais."""
from __future__ import annotations

from django.db import IntegrityError, transaction
from django.db.models import Max

from contexts.sales.domain.entities.proposal import Proposal, ProposalLineItem
from contexts.sales.infrastructure.django.models import (
    ProposalLineItemModel,
    ProposalModel,
)
from shared.domain.errors import NotFoundError


def _item_to_entity(row: ProposalLineItemModel) -> ProposalLineItem:
    return ProposalLineItem(
        id=str(row.id),
        description=row.description,
        quantity=row.quantity,
        unit_price=row.unit_price,
        position=row.position,
    )


def _to_entity(row: ProposalModel) -> Proposal:
    return Proposal(
        id=str(row.id),
        workspace_id=str(row.workspace_id),
        deal_id=str(row.deal_id),
        title=row.title,
        number=row.number,
        status=row.status,
        currency=row.currency,
        discount=row.discount,
        intro=row.intro,
        terms=row.terms,
        valid_until=row.valid_until,
        items=[_item_to_entity(item) for item in row.items.all()],
        sent_at=row.sent_at,
        sent_to=row.sent_to,
        accepted_at=row.accepted_at,
        rejected_at=row.rejected_at,
        rejection_reason=row.rejection_reason,
        created_by_id=str(row.created_by_id) if row.created_by_id else None,
        deal_title=row.deal.title if row.deal_id else "",
        customer_name=row.deal.customer.name if row.deal_id else "",
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


class DjangoProposalRepository:
    """Repositório de propostas. Carrega itens e deal juntos — o PDF e a
    listagem precisam dos dois, e sem isso a lista vira N+1."""

    _SELECT = ("deal", "deal__customer")

    def _queryset(self):
        return ProposalModel.objects.select_related(*self._SELECT).prefetch_related("items")

    def list_for_workspace(
        self, workspace_id: str, *, deal_id: str | None = None
    ) -> list[Proposal]:
        qs = self._queryset().filter(workspace_id=workspace_id)
        if deal_id:
            qs = qs.filter(deal_id=deal_id)
        return [_to_entity(row) for row in qs]

    def get(self, proposal_id: str) -> Proposal | None:
        row = self._queryset().filter(id=proposal_id).first()
        return _to_entity(row) if row else None

    def require(self, proposal_id: str) -> Proposal:
        proposal = self.get(proposal_id)
        if proposal is None:
            raise NotFoundError("Proposta não encontrada.")
        return proposal

    def next_number(self, workspace_id: str) -> int:
        highest = ProposalModel.objects.filter(workspace_id=workspace_id).aggregate(
            Max("number")
        )["number__max"]
        return (highest or 0) + 1

    def create(self, proposal: Proposal) -> Proposal:
        """Cria a proposta atribuindo o próximo número do workspace.

        Dois usuários criando ao mesmo tempo disputam o mesmo `number`; a
        constraint única barra o segundo, e aqui refazemos o cálculo em vez de
        estourar erro na cara de quem só clicou em "nova proposta".
        """
        for _attempt in range(5):
            number = self.next_number(proposal.workspace_id)
            try:
                with transaction.atomic():
                    row = ProposalModel.objects.create(
                        workspace_id=proposal.workspace_id,
                        deal_id=proposal.deal_id,
                        number=number,
                        title=proposal.title,
                        status=proposal.status,
                        currency=proposal.currency,
                        discount=proposal.discount,
                        intro=proposal.intro,
                        terms=proposal.terms,
                        valid_until=proposal.valid_until,
                        created_by_id=proposal.created_by_id,
                    )
                    self._write_items(row, proposal.items)
                return self.require(str(row.id))
            except IntegrityError:
                continue
        raise IntegrityError("Não foi possível gerar o número da proposta.")

    def update(self, proposal: Proposal) -> Proposal:
        updated = ProposalModel.objects.filter(id=proposal.id).update(
            title=proposal.title,
            status=proposal.status,
            currency=proposal.currency,
            discount=proposal.discount,
            intro=proposal.intro,
            terms=proposal.terms,
            valid_until=proposal.valid_until,
            sent_at=proposal.sent_at,
            sent_to=proposal.sent_to,
            accepted_at=proposal.accepted_at,
            rejected_at=proposal.rejected_at,
            rejection_reason=proposal.rejection_reason,
        )
        if not updated:
            raise NotFoundError("Proposta não encontrada.")
        return self.require(str(proposal.id))

    def delete(self, proposal_id: str) -> None:
        ProposalModel.objects.filter(id=proposal_id).delete()

    def replace_items(self, proposal_id: str, items: list[ProposalLineItem]) -> Proposal:
        row = ProposalModel.objects.filter(id=proposal_id).first()
        if row is None:
            raise NotFoundError("Proposta não encontrada.")
        with transaction.atomic():
            row.items.all().delete()
            self._write_items(row, items)
        return self.require(proposal_id)

    @staticmethod
    def _write_items(row: ProposalModel, items: list[ProposalLineItem]) -> None:
        ProposalLineItemModel.objects.bulk_create(
            [
                ProposalLineItemModel(
                    proposal=row,
                    description=item.description,
                    quantity=item.quantity,
                    unit_price=item.unit_price,
                    # A ordem da lista é a ordem da tabela — ignora `position`
                    # enviado pelo cliente, que pode vir furado.
                    position=index,
                )
                for index, item in enumerate(items)
            ]
        )
