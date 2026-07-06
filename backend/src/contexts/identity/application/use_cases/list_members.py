"""Caso de uso: listar membros de um workspace."""
from contexts.identity.domain.repositories.workspace_repository import (
    MembershipRepository,
    MemberView,
)
from shared.domain.errors import PermissionDeniedError


class ListMembers:
    """Lista membros do workspace; só membros podem ver."""

    def __init__(self, membership_repository: MembershipRepository):
        self.membership_repository = membership_repository

    def execute(self, *, workspace_id: str, actor_id: str) -> list[MemberView]:
        if not self.membership_repository.exists(
            workspace_id=workspace_id, user_id=actor_id
        ):
            raise PermissionDeniedError("Você não tem acesso a este workspace.")
        return self.membership_repository.list_members(workspace_id=workspace_id)
