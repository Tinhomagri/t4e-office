"""Guarda de acesso reutilizável para as views finas do contexto projects.

Centraliza a checagem de pertencimento ao workspace (multi-tenancy). As views
"cruas" (sem use case dedicado) chamam estes helpers para evitar vazamento de
dados entre workspaces. Levantam erros de domínio que o
``domain_exception_handler`` traduz para 403/404.

Resolução de workspace por objeto:
  project_id  → ProjectModel.workspace_id
  card_id     → Card → Project → workspace_id
  qualquer objeto com ``project_id`` → idem project.

Papel (role): por ora qualquer membro do workspace tem acesso. O parâmetro
``min_role`` fica reservado para a granularidade de ProjectRole/PermissionScheme
das próximas entregas da Onda 1.
"""
from __future__ import annotations

from contexts.identity.infrastructure.django.models import MembershipModel
from contexts.projects.infrastructure.django.models import (
    CardModel,
    ProjectModel,
)
from contexts.projects.interface.api.capabilities import capabilities_for
from shared.domain.errors import NotFoundError, PermissionDeniedError

# Hierarquia de papéis (maior número = mais poder). Reservado para granularidade.
_ROLE_RANK = {"member": 1, "admin": 2, "owner": 3}


def _membership(workspace_id: str, user_id: str) -> MembershipModel | None:
    return MembershipModel.objects.filter(
        workspace_id=workspace_id, user_id=user_id
    ).first()


def _assert_workspace(workspace_id: str, user_id: str, min_role: str) -> None:
    membership = _membership(workspace_id, user_id)
    if membership is None:
        raise PermissionDeniedError("Você não tem acesso a este recurso.")
    if _ROLE_RANK.get(membership.role, 0) < _ROLE_RANK.get(min_role, 1):
        raise PermissionDeniedError("Seu papel não permite esta operação.")


def assert_project_member(
    *, project_id: str, user_id: str, min_role: str = "member"
) -> ProjectModel:
    """Garante que o usuário é membro do workspace do projeto. Retorna o projeto."""
    project = ProjectModel.objects.filter(id=project_id).first()
    if project is None:
        raise NotFoundError("Projeto não encontrado.")
    _assert_workspace(str(project.workspace_id), user_id, min_role)
    return project


def assert_card_member(
    *, card_id: str, user_id: str, min_role: str = "member"
) -> CardModel:
    """Garante acesso ao card via workspace do projeto. Retorna o card."""
    card = (
        CardModel.objects.filter(id=card_id).select_related("project").first()
    )
    if card is None:
        raise NotFoundError("Card não encontrado.")
    _assert_workspace(str(card.project.workspace_id), user_id, min_role)
    return card


# ── Guardas por capacidade (Domínio 12) ──────────────────────────────────────

def assert_project_capability(
    *, project_id: str, user_id: str, capability: str
) -> ProjectModel:
    """Garante que o usuário tem a capacidade no projeto. Retorna o projeto."""
    project = ProjectModel.objects.filter(id=project_id).first()
    if project is None:
        raise NotFoundError("Projeto não encontrado.")
    if capability not in capabilities_for(project, user_id):
        raise PermissionDeniedError("Você não tem permissão para esta ação.")
    return project


def assert_card_capability(
    *, card_id: str, user_id: str, capability: str
) -> CardModel:
    """Garante a capacidade no projeto do card. Retorna o card."""
    card = (
        CardModel.objects.filter(id=card_id).select_related("project").first()
    )
    if card is None:
        raise NotFoundError("Card não encontrado.")
    if capability not in capabilities_for(card.project, user_id):
        raise PermissionDeniedError("Você não tem permissão para esta ação.")
    return card
