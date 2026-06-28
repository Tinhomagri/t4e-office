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

from contexts.identity.infrastructure.django.models import MembershipModel
from contexts.projects.infrastructure.django.models import (
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


def effective_role(project: ProjectModel, user_id: str) -> str | None:
    """Papel efetivo do usuário no projeto, ou None se sem acesso."""
    # 1) Atribuição explícita (maior poder vence).
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

    # 2) Deriva do papel de workspace.
    membership = MembershipModel.objects.filter(
        workspace_id=project.workspace_id, user_id=user_id
    ).first()
    if membership is None:
        return None
    return _WORKSPACE_TO_PROJECT_ROLE.get(membership.role, "developer")


def capabilities_for(project: ProjectModel, user_id: str) -> set[str]:
    """Conjunto de capacidades do usuário no projeto (vazio se sem acesso)."""
    role = effective_role(project, user_id)
    if role is None:
        return set()
    return set(ROLE_CAPABILITIES.get(role, {BROWSE}))
