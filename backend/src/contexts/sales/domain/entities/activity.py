"""Entidade de atividade de um negócio — Python puro."""
from dataclasses import dataclass
from datetime import datetime
from enum import Enum

from shared.domain.errors import ValidationError


class ActivityKind(str, Enum):
    """Tipo da atividade registrada no negócio."""

    NOTE = "note"
    TASK = "task"
    MEETING = "meeting"


@dataclass
class DealActivity:
    """Nota, tarefa com prazo ou reunião vinculada a um negócio."""

    id: str | None
    deal_id: str
    kind: ActivityKind
    content: str
    author_id: str | None = None
    due_date: datetime | None = None  # tarefas e reuniões
    end_date: datetime | None = None  # fim da reunião
    assignee_id: str | None = None  # responsável pela tarefa
    done_at: datetime | None = None
    google_event_id: str = ""  # reuniões criadas na Agenda Google
    meet_url: str = ""
    created_at: datetime | None = None
    # Campos desnormalizados só para exibição (mesmo padrão de DealHistory):
    # evitam N+1 no feed de atividades, que mostra autor e negócio de origem.
    author_name: str = ""
    deal_title: str = ""

    def __post_init__(self) -> None:
        if not self.content.strip():
            raise ValidationError("O conteúdo da atividade é obrigatório.")
        if self.kind == ActivityKind.MEETING and self.due_date is None:
            raise ValidationError("Informe a data e hora de início da reunião.")
        if (
            self.kind == ActivityKind.MEETING
            and self.end_date is not None
            and self.due_date is not None
            and self.end_date <= self.due_date
        ):
            raise ValidationError("O fim da reunião deve ser posterior ao início.")
