"""Guarda de acesso das views do contexto chatwoot (multi-tenancy)."""
from __future__ import annotations

from contexts.identity.infrastructure.django.models import MembershipModel
from shared.domain.errors import PermissionDeniedError, ValidationError

_ROLE_RANK = {"member": 1, "admin": 2, "owner": 3}


def assert_workspace_member(
    *, workspace_id: str, user_id: str, min_role: str = "member"
) -> None:
    """Garante que o usuário é membro do workspace com papel suficiente.

    Configurar a conexão (token da instância inteira) exige `admin`; atender
    conversa é papel de `member`.
    """
    membership = MembershipModel.objects.filter(
        workspace_id=workspace_id, user_id=user_id
    ).first()
    if membership is None:
        raise PermissionDeniedError("Você não tem acesso a este workspace.")
    if _ROLE_RANK.get(membership.role, 0) < _ROLE_RANK.get(min_role, 1):
        raise PermissionDeniedError("Seu papel não permite esta operação.")


def required_workspace(request, *, min_role: str = "member") -> str:
    """Lê `workspace_id` da query/body, valida o acesso e devolve o id."""
    workspace_id = request.query_params.get("workspace_id") or (
        request.data.get("workspace_id") if hasattr(request, "data") else None
    )
    if not workspace_id:
        raise ValidationError("Informe o workspace_id.")
    assert_workspace_member(
        workspace_id=str(workspace_id), user_id=str(request.user.id), min_role=min_role
    )
    return str(workspace_id)
