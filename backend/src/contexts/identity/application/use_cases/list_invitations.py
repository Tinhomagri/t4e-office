"""Caso de uso: listar convites de um workspace."""
from contexts.identity.domain.entities.invitation import Invitation
from contexts.identity.domain.repositories.invitation_repository import (
    InvitationRepository,
)
from contexts.identity.domain.repositories.workspace_repository import (
    MembershipRepository,
)
from shared.domain.errors import PermissionDeniedError


class ListInvitations:
    """Lista convites do workspace; só owner/admin podem ver."""

    def __init__(
        self,
        invitation_repository: InvitationRepository,
        membership_repository: MembershipRepository,
    ):
        self.invitation_repository = invitation_repository
        self.membership_repository = membership_repository

    def execute(self, *, workspace_id: str, actor_id: str) -> list[Invitation]:
        actor_role = self.membership_repository.role_of(
            workspace_id=workspace_id, user_id=actor_id
        )
        if actor_role is None or not actor_role.can_manage_members:
            raise PermissionDeniedError("Apenas owner ou admin podem ver convites.")
        return self.invitation_repository.list_by_workspace(workspace_id=workspace_id)
