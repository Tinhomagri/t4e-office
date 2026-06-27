"""Entidade de card (tarefa do board) — Python puro."""
from dataclasses import dataclass
from enum import Enum

from shared.domain.errors import ValidationError


class CardStatus(str, Enum):
    """Coluna do board onde o card está."""

    BACKLOG = "backlog"
    TODO = "todo"
    DOING = "doing"
    REVIEW = "review"
    DONE = "done"


class CardType(str, Enum):
    """Natureza do trabalho do card."""

    FEATURE = "feature"
    BUG = "bug"
    DEBT = "debt"
    SPIKE = "spike"
    CHORE = "chore"


class CardPriority(str, Enum):
    """Prioridade do card."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"


@dataclass
class Card:
    """Card de trabalho pertencente a um projeto.

    O `number` é sequencial por projeto; combinado com a `key` do projeto forma
    o identificador legível (ex.: MIA-142), exposto como `ref`.
    """

    id: str | None
    project_id: str
    number: int
    title: str
    description: str = ""
    status: CardStatus = CardStatus.TODO
    type: CardType = CardType.FEATURE
    priority: CardPriority = CardPriority.MEDIUM
    points: int | None = None
    assignee_id: str | None = None
    sprint_id: str | None = None  # None = card no backlog do projeto
    order: int = 0
    source: str = "manual"  # manual | copilot (criado pela IA)

    def __post_init__(self) -> None:
        if not self.title.strip():
            raise ValidationError("Título do card é obrigatório.")
        if self.points is not None and self.points < 0:
            raise ValidationError("Story points não podem ser negativos.")
