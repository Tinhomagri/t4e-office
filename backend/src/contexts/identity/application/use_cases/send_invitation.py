"""Caso de uso: enviar convite de workspace por email."""
import secrets

from contexts.identity.domain.entities.invitation import Invitation, InvitationStatus
from contexts.identity.domain.ports.email_sender import EmailSender
from contexts.identity.domain.repositories.invitation_repository import (
    InvitationRepository,
)
from contexts.identity.domain.repositories.workspace_repository import (
    MembershipRepository,
    WorkspaceRepository,
)
from contexts.identity.domain.value_objects.email import Email
from contexts.identity.domain.value_objects.role import Role
from shared.domain.errors import ConflictError, NotFoundError, PermissionDeniedError


class SendInvitation:
    """Cria um convite pendente e dispara o email; só owner/admin podem convidar."""

    def __init__(
        self,
        invitation_repository: InvitationRepository,
        membership_repository: MembershipRepository,
        workspace_repository: WorkspaceRepository,
        email_sender: EmailSender,
    ):
        self.invitation_repository = invitation_repository
        self.membership_repository = membership_repository
        self.workspace_repository = workspace_repository
        self.email_sender = email_sender

    def execute(
        self,
        *,
        workspace_id: str,
        email: str,
        role: str,
        actor_id: str,
        inviter_name: str = "",
    ) -> Invitation:
        actor_role = self.membership_repository.role_of(
            workspace_id=workspace_id, user_id=actor_id
        )
        if actor_role is None or not actor_role.can_manage_members:
            raise PermissionDeniedError("Apenas owner ou admin podem convidar.")

        workspace = self.workspace_repository.get(workspace_id=workspace_id)
        if workspace is None:
            raise NotFoundError("Workspace não encontrado.")

        email_norm = str(Email(email))
        if self.invitation_repository.pending_exists(
            workspace_id=workspace_id, email=email_norm
        ):
            raise ConflictError("Já existe um convite pendente para este email.")

        invitation = Invitation(
            id=None,
            workspace_id=workspace_id,
            email=Email(email_norm),
            role=Role(role),
            token=secrets.token_urlsafe(32),
            status=InvitationStatus.PENDING,
        )
        saved = self.invitation_repository.create(invitation=invitation)

        self.email_sender.send_invitation(
            to_email=email_norm,
            workspace_name=workspace.name,
            inviter_name=inviter_name or "Um colega",
            token=saved.token,
        )
        return saved
