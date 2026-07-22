"""Guarda de acesso compartilhada pelos casos de uso do contexto sales."""
from contexts.sales.domain.repositories.customer_repository import WorkspaceAccess
from shared.domain.errors import PermissionDeniedError


def assert_workspace_member(
    workspace_access: WorkspaceAccess, *, workspace_id: str, actor_id: str
) -> None:
    """Garante que o ator é membro do workspace dono do recurso."""
    if not workspace_access.is_member(workspace_id=workspace_id, user_id=actor_id):
        raise PermissionDeniedError("Você não tem acesso a este workspace.")
