"""Entidade de projeto — Python puro."""
from dataclasses import dataclass

from shared.domain.errors import ValidationError


@dataclass
class Project:
    """Projeto pertencente a um workspace. Agrupa boards/sprints/cards (futuro)."""

    id: str | None
    workspace_id: str
    name: str
    key: str  # prefixo curto do ID de cards, ex.: MIA

    def __post_init__(self) -> None:
        if not self.name.strip():
            raise ValidationError("Nome do projeto é obrigatório.")
        if not (2 <= len(self.key) <= 10) or not self.key.isalnum():
            raise ValidationError("A chave do projeto deve ter 2 a 10 caracteres alfanuméricos.")
