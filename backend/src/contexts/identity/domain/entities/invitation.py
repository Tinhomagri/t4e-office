"""Entidade de convite para workspace — Python puro."""
from dataclasses import dataclass
from enum import Enum

from contexts.identity.domain.value_objects.email import Email
from contexts.identity.domain.value_objects.role import Role
from shared.domain.errors import ConflictError


class InvitationStatus(str, Enum):
    """Estado do convite."""

    PENDING = "pending"
    ACCEPTED = "accepted"
    REVOKED = "revoked"


@dataclass
class Invitation:
    """Convite por email para ingressar em um workspace."""

    id: str | None
    workspace_id: str
    email: Email
    role: Role
    token: str
    status: InvitationStatus = InvitationStatus.PENDING

    def accept(self) -> None:
        """Marca o convite como aceito; só convite pendente pode ser aceito."""
        if self.status is not InvitationStatus.PENDING:
            raise ConflictError("Este convite não está mais disponível.")
        self.status = InvitationStatus.ACCEPTED
