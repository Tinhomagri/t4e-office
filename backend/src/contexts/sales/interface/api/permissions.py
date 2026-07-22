"""Guarda de acesso reutilizável para as views do contexto sales.

Centraliza a checagem de pertencimento ao workspace (multi-tenancy) das views
"cruas" — as que não passam por um caso de uso dedicado. Levanta erros de
domínio que o ``domain_exception_handler`` traduz para 403/404.

Resolução de workspace por objeto:
  workspace_id → MembershipModel
  deal_id      → DealModel.workspace_id
  customer_id  → CustomerModel.workspace_id
"""
from __future__ import annotations

from contexts.identity.infrastructure.django.models import MembershipModel
from contexts.sales.infrastructure.django.models import CustomerModel, DealModel
from shared.domain.errors import NotFoundError, PermissionDeniedError

# Hierarquia de papéis (maior número = mais poder). Reservado para granularidade.
_ROLE_RANK = {"member": 1, "admin": 2, "owner": 3}


def assert_workspace_member(
    *, workspace_id: str, user_id: str, min_role: str = "member"
) -> None:
    """Garante que o usuário é membro do workspace."""
    membership = MembershipModel.objects.filter(
        workspace_id=workspace_id, user_id=user_id
    ).first()
    if membership is None:
        raise PermissionDeniedError("Você não tem acesso a este workspace.")
    if _ROLE_RANK.get(membership.role, 0) < _ROLE_RANK.get(min_role, 1):
        raise PermissionDeniedError("Seu papel não permite esta operação.")


def assert_deal_member(
    *, deal_id: str, user_id: str, min_role: str = "member"
) -> DealModel:
    """Garante acesso ao negócio via workspace dono. Retorna o negócio."""
    deal = DealModel.objects.filter(id=deal_id).first()
    if deal is None:
        raise NotFoundError("Negócio não encontrado.")
    assert_workspace_member(
        workspace_id=str(deal.workspace_id), user_id=user_id, min_role=min_role
    )
    return deal


def assert_customer_member(
    *, customer_id: str, user_id: str, min_role: str = "member"
) -> CustomerModel:
    """Garante acesso ao cliente via workspace dono. Retorna o cliente."""
    customer = CustomerModel.objects.filter(id=customer_id).first()
    if customer is None:
        raise NotFoundError("Cliente não encontrado.")
    assert_workspace_member(
        workspace_id=str(customer.workspace_id), user_id=user_id, min_role=min_role
    )
    return customer
