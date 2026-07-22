"""Entidade de estágio do funil de vendas — Python puro."""
from dataclasses import dataclass
from enum import Enum

from shared.domain.errors import ValidationError


class StageKind(str, Enum):
    """Natureza do estágio: aberto, ganho ou perdido."""

    OPEN = "open"
    WON = "won"
    LOST = "lost"


@dataclass
class PipelineStage:
    """Coluna do funil comercial de um workspace."""

    id: str | None
    workspace_id: str
    name: str
    slug: str
    color: str = "#6b7280"
    order: int = 0
    probability_default: int = 0
    kind: StageKind = StageKind.OPEN

    def __post_init__(self) -> None:
        if not self.name.strip():
            raise ValidationError("Nome do estágio é obrigatório.")
        if not self.slug.strip():
            raise ValidationError("Slug do estágio é obrigatório.")
        if not 0 <= self.probability_default <= 100:
            raise ValidationError("A probabilidade padrão deve estar entre 0 e 100.")
