"""Entidade de card (tarefa do board) — Python puro."""
from dataclasses import dataclass, field
from datetime import date, datetime
from enum import Enum

from shared.domain.errors import ValidationError


class CardStatus(str, Enum):
    """Coluna do board onde o card está."""

    BACKLOG = "backlog"
    TODO = "todo"
    DOING = "doing"
    REVIEW = "review"
    DONE = "done"
    # Fluxo de marketing (templates Campanha/Social/Conteúdo)
    BRIEFING = "briefing"
    CRIACAO = "criacao"
    APROVACAO = "aprovacao"
    AGENDADO = "agendado"
    PUBLICADO = "publicado"


class CardType(str, Enum):
    """Natureza do trabalho do card."""

    FEATURE = "feature"
    BUG = "bug"
    DEBT = "debt"
    SPIKE = "spike"
    CHORE = "chore"
    EPIC = "epic"
    # Tipos de trabalho de marketing
    POST = "post"
    PECA = "peca"
    CAMPANHA = "campanha"
    ARTIGO = "artigo"
    EMAIL = "email"


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
    reporter_id: str | None = None  # relator (quem pediu/abriu)
    sprint_id: str | None = None  # None = card no backlog do projeto
    start_date: date | None = None
    due_date: date | None = None
    order: int = 0
    rank: str = ""  # Lexorank — ordenação estável no backlog/board
    source: str = "manual"  # manual | copilot (criado pela IA)
    parent_id: str | None = None  # card pai (subtarefa) — None = card de topo
    epic_id: str | None = None  # épico ao qual pertence — None = sem épico
    epic_color: str = ""  # cor do épico (apenas quando type=epic)
    labels: list[str] = field(default_factory=list)
    channel: str = ""  # canal de marketing (instagram, linkedin, blog, email…)
    publish_date: date | None = None  # data de publicação — calendário editorial
    created_at: datetime | None = None
    updated_at: datetime | None = None

    def __post_init__(self) -> None:
        if not self.title.strip():
            raise ValidationError("Título do card é obrigatório.")
        if self.parent_id is not None and self.parent_id == self.id:
            raise ValidationError("Um card não pode ser subtarefa de si mesmo.")
        if self.epic_id is not None and self.epic_id == self.id:
            raise ValidationError("Um épico não pode pertencer a si mesmo.")
        if self.type == CardType.EPIC and self.epic_id is not None:
            raise ValidationError("Um épico não pode pertencer a outro épico.")
        if self.type == CardType.EPIC and self.parent_id is not None:
            raise ValidationError("Um épico não pode ser subtarefa.")
        if self.points is not None and self.points < 0:
            raise ValidationError("Story points não podem ser negativos.")
        if (
            self.start_date is not None
            and self.due_date is not None
            and self.due_date < self.start_date
        ):
            raise ValidationError("O prazo não pode ser anterior à data de início.")
