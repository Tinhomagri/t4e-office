"""Entidade de usuário — Python puro, sem Django."""
from dataclasses import dataclass

from contexts.identity.domain.value_objects.email import Email


@dataclass
class User:
    """Usuário do sistema. Autenticado por email + senha."""

    id: str | None
    email: Email
    full_name: str
    is_active: bool = True

    def __post_init__(self) -> None:
        if not self.full_name.strip():
            from shared.domain.errors import ValidationError

            raise ValidationError("Nome completo é obrigatório.")
