"""Entidade de comentário de card — Python puro."""
from dataclasses import dataclass
from datetime import datetime

from shared.domain.errors import ValidationError


@dataclass
class CardComment:
    """Comentário na atividade de um card."""

    id: str | None
    card_id: str
    author_id: str
    body: str
    created_at: datetime | None = None
    # Dados desnormalizados do autor para exibição (preenchidos na leitura).
    author_name: str = ""

    def __post_init__(self) -> None:
        if not self.body.strip():
            raise ValidationError("O comentário não pode ser vazio.")
