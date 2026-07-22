"""Entidade de contato de um cliente — Python puro."""
from dataclasses import dataclass

from shared.domain.errors import ValidationError


@dataclass
class Contact:
    """Pessoa de contato vinculada a um cliente."""

    id: str | None
    customer_id: str
    name: str
    role: str = ""  # cargo/função
    email: str = ""
    phone: str = ""
    is_primary: bool = False

    def __post_init__(self) -> None:
        if not self.name.strip():
            raise ValidationError("Nome do contato é obrigatório.")
