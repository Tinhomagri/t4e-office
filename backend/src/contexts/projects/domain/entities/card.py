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


class CardResolution(str, Enum):
    """*Por que* o card saiu do fluxo.

    Separado do status de propósito: "está na coluna Concluído" e "foi entregue"
    não são a mesma coisa. Sem isto, um card cancelado e um card entregue contam
    igual na velocity, e o relatório mente sobre o que a equipe produziu.
    """

    DONE = "done"  # entregue
    WONT_DO = "wont_do"  # decidido não fazer
    DUPLICATE = "duplicate"  # já coberto por outro card
    CANNOT_REPRODUCE = "cannot_reproduce"  # bug que não se confirmou
    INCOMPLETE = "incomplete"  # abandonado sem conclusão

    @property
    def counts_as_delivered(self) -> bool:
        """Só `DONE` entra em velocity/burndown como trabalho entregue."""
        return self is CardResolution.DONE


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
    # String livre, não o enum: colunas custom (WorkflowStatus) usam slugs fora
    # do fluxo padrão, e a entidade não valida contra a lista de colunas do
    # projeto — quem sabe o slug é válido é o repositório de WorkflowStatus.
    status: str = CardStatus.TODO.value
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
    # Desfecho do card. `None` = ainda em aberto. Quem preenche/limpa é o caso de
    # uso ao mover o card para (ou fora de) uma coluna da categoria `done` — a
    # entidade não conhece a categoria, que vive em WorkflowStatus.
    resolution: CardResolution | None = None
    resolved_at: datetime | None = None
    # Tempo em segundos. `original` é a estimativa combinada e não muda sozinha;
    # `remaining` é o que a pessoa acha que falta e cai conforme ela apropria
    # horas. Sem os dois não há "restante vs gasto" — só total gasto.
    original_estimate_seconds: int | None = None
    remaining_estimate_seconds: int | None = None
    # Sinalizador de atenção (igual "Flag" do Jira) — aura laranja + "!" no
    # card. Cliente marca na criação pelo link público; time também alterna.
    flagged: bool = False
    # Arquivar preserva histórico sem poluir board/relatórios; deletar perdia o
    # rastro do que foi decidido.
    archived_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    @property
    def is_archived(self) -> bool:
        return self.archived_at is not None

    @property
    def is_resolved(self) -> bool:
        return self.resolution is not None

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
        if self.resolution is not None and self.resolved_at is None:
            raise ValidationError("Card resolvido precisa da data de resolução.")
        if self.resolution is None and self.resolved_at is not None:
            raise ValidationError("Data de resolução exige um desfecho.")
        for label, seconds in (
            ("A estimativa", self.original_estimate_seconds),
            ("O tempo restante", self.remaining_estimate_seconds),
        ):
            if seconds is not None and seconds < 0:
                raise ValidationError(f"{label} não pode ser negativo(a).")
        if (
            self.start_date is not None
            and self.due_date is not None
            and self.due_date < self.start_date
        ):
            raise ValidationError("O prazo não pode ser anterior à data de início.")
