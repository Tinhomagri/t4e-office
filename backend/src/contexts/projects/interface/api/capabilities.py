"""Matriz de capacidades por papel de projeto (Domínio 12).

Decisão de arquitetura: papéis (ProjectRole) e seus membros vivem no banco, mas
*o que cada papel pode fazer* é definido aqui em código — extensível para um
PermissionScheme 100% DB no futuro sem quebrar contrato.

Resolução do papel efetivo de um usuário num projeto:
  1. Atribuição explícita (ProjectRoleMember) → maior papel atribuído.
  2. Senão, deriva do papel de workspace: owner/admin → admin; member → developer.
  3. Não-membro do workspace → sem papel (sem acesso).
"""
from __future__ import annotations

from contexts.estimation.infrastructure.django.models import SquadMemberModel
from contexts.identity.infrastructure.django.models import MembershipModel
from contexts.projects.infrastructure.django.models import (
    ProjectDeleteGrantModel,
    ProjectModel,
    ProjectRoleMemberModel,
)

# ── Capacidades ───────────────────────────────────────────────────────────────
BROWSE = "browse"
CREATE_ISSUE = "create_issue"
EDIT_ISSUE = "edit_issue"
DELETE_ISSUE = "delete_issue"
TRANSITION_ISSUE = "transition_issue"
ASSIGN_ISSUE = "assign_issue"
COMMENT = "comment"
MANAGE_SPRINTS = "manage_sprints"
MANAGE_VERSIONS = "manage_versions"
MANAGE_COMPONENTS = "manage_components"
MANAGE_CUSTOM_FIELDS = "manage_custom_fields"
MANAGE_WORKFLOW = "manage_workflow"
MANAGE_AUTOMATION = "manage_automation"
ADMINISTER_PROJECT = "administer_project"

_ALL = {
    BROWSE, CREATE_ISSUE, EDIT_ISSUE, DELETE_ISSUE, TRANSITION_ISSUE,
    ASSIGN_ISSUE, COMMENT, MANAGE_SPRINTS, MANAGE_VERSIONS, MANAGE_COMPONENTS,
    MANAGE_CUSTOM_FIELDS, MANAGE_WORKFLOW, MANAGE_AUTOMATION, ADMINISTER_PROJECT,
}

# Capacidades por slug de papel.
ROLE_CAPABILITIES: dict[str, set[str]] = {
    "admin": set(_ALL),
    "developer": {
        BROWSE, CREATE_ISSUE, EDIT_ISSUE, TRANSITION_ISSUE, ASSIGN_ISSUE,
        COMMENT, MANAGE_SPRINTS, MANAGE_VERSIONS, MANAGE_COMPONENTS,
        MANAGE_WORKFLOW,
    },
    "viewer": {BROWSE, COMMENT},
}

# Papéis padrão semeados em todo projeto.
DEFAULT_ROLES = [
    {"slug": "admin", "name": "Administrador"},
    {"slug": "developer", "name": "Desenvolvedor"},
    {"slug": "viewer", "name": "Visualizador"},
]

# Mapa papel-de-workspace → papel-de-projeto derivado.
_WORKSPACE_TO_PROJECT_ROLE = {
    "owner": "admin",
    "admin": "admin",
    "member": "developer",
}


def can_browse(project: ProjectModel, user_id: str) -> bool:
    """A pessoa pode ENXERGAR este board?

    Três caminhos, nesta ordem:
      1. owner/admin do workspace — administram tudo. Sem isto, fechar todos os
         projetos trancaria a chave do lado de fora: a tela de permissões se
         acessa a partir do projeto, e ninguém conseguiria dar acesso a ninguém.
      2. projeto aberto ao workspace (`visibility="workspace"`);
      3. papel atribuído explicitamente no projeto.

    Fora isso, o board não existe para a pessoa — nem na lista, nem por URL.
    """
    membership = MembershipModel.objects.filter(
        workspace_id=project.workspace_id, user_id=user_id
    ).first()
    if membership is None:
        return False
    if membership.role in ("owner", "admin"):
        return True
    if project.visibility == "workspace":
        return True
    # Estar na squad dona do board basta: é o caminho normal de acesso, e evita
    # repetir a mesma lista de pessoas em cada projeto do time.
    if project.squad_id and SquadMemberModel.objects.filter(
        squad_id=project.squad_id, user_id=user_id
    ).exists():
        return True
    if str(user_id) in {str(value) for value in (project.access_user_ids or [])}:
        return True
    return ProjectRoleMemberModel.objects.filter(
        role__project_id=project.id, user_id=user_id
    ).exists()


def effective_role(project: ProjectModel, user_id: str) -> str | None:
    """Papel efetivo do usuário no projeto, ou None se sem acesso."""
    if not can_browse(project, user_id):
        return None
    membership = MembershipModel.objects.filter(
        workspace_id=project.workspace_id, user_id=user_id
    ).first()
    if membership is None:
        return None
    # Owner/admin do workspace administram tudo — uma atribuição explícita
    # mais fraca no projeto (ex.: viewer) não pode rebaixar quem administra o
    # workspace inteiro.
    if membership.role in ("owner", "admin"):
        return "admin"

    # Atribuição explícita (maior poder vence).
    assigned = list(
        ProjectRoleMemberModel.objects.filter(
            role__project_id=project.id, user_id=user_id
        ).values_list("role__slug", flat=True)
    )
    if assigned:
        order = ["admin", "developer", "viewer"]
        for slug in order:
            if slug in assigned:
                return slug
        return assigned[0]

    return _WORKSPACE_TO_PROJECT_ROLE.get(membership.role, "developer")


def can_delete_cards(project: ProjectModel, user_id: str) -> bool:
    """Deletar card não vem do papel — é concedido pessoa a pessoa pelo admin,
    exceto pra quem já é admin (esse já tem tudo)."""
    role = effective_role(project, user_id)
    if role == "admin":
        return True
    return ProjectDeleteGrantModel.objects.filter(
        project_id=project.id, user_id=user_id
    ).exists()


def capabilities_for(project: ProjectModel, user_id: str) -> set[str]:
    """Conjunto de capacidades do usuário no projeto (vazio se sem acesso)."""
    role = effective_role(project, user_id)
    if role is None:
        return set()
    caps = set(ROLE_CAPABILITIES.get(role, {BROWSE}))
    if can_delete_cards(project, user_id):
        caps.add(DELETE_ISSUE)
    return caps
