"""Entidade de workspace e membership — Python puro."""
from dataclasses import dataclass

from contexts.identity.domain.value_objects.role import Role
from shared.domain.errors import ValidationError


@dataclass
class Workspace:
    """Espaço de trabalho que agrupa membros e projetos."""

    id: str | None
    name: str
    slug: str
    owner_id: str

    def __post_init__(self) -> None:
        if not self.name.strip():
            raise ValidationError("Nome do workspace é obrigatório.")


@dataclass
class Membership:
    """Vínculo de um usuário a um workspace com um papel."""

    id: str | None
    workspace_id: str
    user_id: str
    role: Role
