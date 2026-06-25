"""Papéis de um membro dentro de um workspace."""
from enum import Enum


class Role(str, Enum):
    """Papel do membro no workspace, em ordem decrescente de privilégio."""

    OWNER = "owner"
    ADMIN = "admin"
    MEMBER = "member"

    @property
    def can_manage_members(self) -> bool:
        """Owner e admin podem convidar/remover membros."""
        return self in (Role.OWNER, Role.ADMIN)
