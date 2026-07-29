"""Porta de persistência das propostas."""
from typing import Protocol

from contexts.sales.domain.entities.proposal import Proposal, ProposalLineItem


class ProposalRepository(Protocol):
    def list_for_workspace(self, workspace_id: str, *, deal_id: str | None = None) -> list[Proposal]:
        ...

    def get(self, proposal_id: str) -> Proposal | None:
        ...

    def create(self, proposal: Proposal) -> Proposal:
        ...

    def update(self, proposal: Proposal) -> Proposal:
        ...

    def delete(self, proposal_id: str) -> None:
        ...

    def replace_items(self, proposal_id: str, items: list[ProposalLineItem]) -> Proposal:
        """Troca o conjunto de linhas de uma vez — a tela edita a tabela inteira."""
        ...

    def next_number(self, workspace_id: str) -> int:
        """Próximo sequencial da proposta neste workspace."""
        ...
