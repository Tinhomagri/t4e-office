"""Ponte entre o atendimento e o funil comercial.

Uma conversa do Chatwoot pode virar (ou pertencer a) um negócio do contexto
`sales`. O vínculo mora no nosso banco — o Chatwoot recebe uma cópia em
`custom_attributes` só para o agente enxergar o mesmo na interface deles.
"""
from __future__ import annotations

from dataclasses import dataclass

from shared.domain.errors import DomainError, NotFoundError, ValidationError


@dataclass
class LinkConversationToDeal:
    """Amarra a conversa a um negócio e/ou cliente do funil.

    Espelhar no Chatwoot é *best effort*: se a instância estiver fora do ar o
    vínculo local continua valendo — quem manda é o nosso banco.
    """

    links: object
    gateway: object
    deals: object  # DealModel manager-like: precisa de .filter(...).first()
    customers: object

    def execute(
        self,
        *,
        workspace_id: str,
        conversation_id: int,
        deal_id: str | None = None,
        customer_id: str | None = None,
        user_id: str | None = None,
    ) -> dict:
        if not deal_id and not customer_id:
            raise ValidationError("Informe o negócio ou o cliente para vincular.")

        # Multi-tenancy: o negócio/cliente precisa ser do mesmo workspace.
        if deal_id:
            deal = self.deals.filter(id=deal_id, workspace_id=workspace_id).first()
            if deal is None:
                raise NotFoundError("Negócio não encontrado neste workspace.")
            # Vincular por negócio já implica o cliente dele.
            customer_id = customer_id or str(deal.customer_id)
        if customer_id:
            customer = self.customers.filter(id=customer_id, workspace_id=workspace_id).first()
            if customer is None:
                raise NotFoundError("Cliente não encontrado neste workspace.")

        self.links.link(
            workspace_id=workspace_id,
            conversation_id=conversation_id,
            deal_id=deal_id,
            customer_id=customer_id,
            user_id=user_id,
        )

        mirrored = True
        try:
            self.gateway.update_custom_attributes(
                conversation_id,
                {"deal_id": deal_id or "", "customer_id": customer_id or ""},
            )
        except DomainError:
            mirrored = False

        return {
            "conversation_id": conversation_id,
            "deal_id": deal_id,
            "customer_id": customer_id,
            "mirrored_to_chatwoot": mirrored,
        }


@dataclass
class UnlinkConversation:
    """Desfaz o vínculo local e limpa o espelho no Chatwoot."""

    links: object
    gateway: object

    def execute(self, *, workspace_id: str, conversation_id: int) -> None:
        self.links.unlink(workspace_id=workspace_id, conversation_id=conversation_id)
        try:
            self.gateway.update_custom_attributes(
                conversation_id, {"deal_id": "", "customer_id": ""}
            )
        except DomainError:
            pass  # o vínculo local já saiu; o espelho é conveniência


@dataclass
class ListDealConversations:
    """Conversas de um negócio — alimenta a aba Atendimento do DealDrawer."""

    links: object
    gateway: object

    def execute(self, *, deal_id: str) -> list:
        ids = self.links.conversations_of_deal(deal_id)
        conversations = []
        for conversation_id in ids:
            try:
                conversations.append(self.gateway.get_conversation(conversation_id))
            except DomainError:
                # Conversa apagada no Chatwoot: ignora em vez de derrubar a aba.
                continue
        return conversations


@dataclass
class ListCustomerConversations:
    """Conversas de um cliente — mesma ideia, na ficha do cliente."""

    links: object
    gateway: object

    def execute(self, *, customer_id: str) -> list:
        ids = self.links.conversations_of_customer(customer_id)
        conversations = []
        for conversation_id in ids:
            try:
                conversations.append(self.gateway.get_conversation(conversation_id))
            except DomainError:
                continue
        return conversations
