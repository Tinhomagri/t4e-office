"""Caso de uso: aceitar convite de workspace."""
from dataclasses import dataclass

from contexts.identity.domain.repositories.invitation_repository import (
    InvitationRepository,
)
from contexts.identity.domain.repositories.workspace_repository import (
    MembershipRepository,
)
from shared.domain.errors import NotFoundError, PermissionDeniedError


@dataclass
class AcceptInvitationResult:
    workspace_id: str
    role: str


class AcceptInvitation:
    """Aceita um convite pendente e vincula o usuário ao workspace.

    O email do convite precisa bater com o email do usuário autenticado.
    """

    def __init__(
        self,
        invitation_repository: InvitationRepository,
        membership_repository: MembershipRepository,
    ):
        self.invitation_repository = invitation_repository
        self.membership_repository = membership_repository

    def execute(
        self, *, token: str, actor_id: str, actor_email: str
    ) -> AcceptInvitationResult:
        invitation = self.invitation_repository.get_by_token(token=token)
        if invitation is None:
            raise NotFoundError("Convite não encontrado.")
        if str(invitation.email).lower() != actor_email.lower():
            raise PermissionDeniedError(
                "Este convite foi enviado para outro email."
            )

        # accept() valida que o convite ainda está pendente (ConflictError se não).
        invitation.accept()

        if not self.membership_repository.exists(
            workspace_id=invitation.workspace_id, user_id=actor_id
        ):
            self.membership_repository.add(
                workspace_id=invitation.workspace_id,
                user_id=actor_id,
                role=invitation.role,
            )
        self.invitation_repository.save(invitation=invitation)
        return AcceptInvitationResult(
            workspace_id=invitation.workspace_id, role=invitation.role.value
        )
