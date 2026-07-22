"""Entidade de cliente — Python puro."""
from dataclasses import dataclass
from datetime import datetime
from enum import Enum

from shared.domain.errors import ValidationError


class CustomerKind(str, Enum):
    """Natureza do cliente: empresa ou pessoa física."""

    COMPANY = "company"
    PERSON = "person"


@dataclass
class Customer:
    """Cliente (empresa ou pessoa) pertencente a um workspace."""

    id: str | None
    workspace_id: str
    name: str
    kind: CustomerKind = CustomerKind.COMPANY
    legal_name: str = ""  # razão social (empresas)
    document: str = ""  # CNPJ ou CPF, apenas dígitos
    email: str = ""
    phone: str = ""
    website: str = ""
    notes: str = ""
    owner_id: str | None = None  # responsável comercial pela conta
    created_at: datetime | None = None
    updated_at: datetime | None = None

    def __post_init__(self) -> None:
        if not self.name.strip():
            raise ValidationError("Nome do cliente é obrigatório.")
