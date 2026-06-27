"""Caso de uso: revogar convite pendente."""
from contexts.identity.domain.entities.invitation import InvitationStatus
from contexts.identity.domain.repositories.invitation_repository import (
    InvitationRepository,
)
from contexts.identity.domain.repositories.workspace_repository import (
    MembershipRepository,
)
from shared.domain.errors import NotFoundError, PermissionDeniedError


class RevokeInvitation:
    """Revoga um convite; só owner/admin do workspace podem."""

    def __init__(
        self,
        invitation_repository: InvitationRepository,
        membership_repository: MembershipRepository,
    ):
        self.invitation_repository = invitation_repository
        self.membership_repository = membership_repository

    def execute(self, *, invitation_id: str, actor_id: str) -> None:
        invitation = self.invitation_repository.get(invitation_id=invitation_id)
        if invitation is None:
            raise NotFoundError("Convite não encontrado.")

        actor_role = self.membership_repository.role_of(
            workspace_id=invitation.workspace_id, user_id=actor_id
        )
        if actor_role is None or not actor_role.can_manage_members:
            raise PermissionDeniedError("Apenas owner ou admin podem revogar convites.")

        invitation.status = InvitationStatus.REVOKED
        self.invitation_repository.save(invitation=invitation)
