"""Entidade de sprint (ciclo de trabalho) — Python puro."""
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from enum import Enum

from shared.domain.errors import ValidationError


# Duas semanas: a cadência que o produto já assumia no código do "iniciar
# sprint" antes de a duração ser configurável.
DEFAULT_SPRINT_DAYS = 14


class SprintStatus(str, Enum):
    """Ciclo de vida da sprint."""

    PLANNED = "planned"
    ACTIVE = "active"
    CLOSED = "closed"


@dataclass
class Sprint:
    """Sprint pertencente a um projeto. Agrupa cards num intervalo de tempo.

    Cards sem sprint vivem no backlog do projeto. Apenas uma sprint `active`
    por projeto é a regra esperada, garantida no caso de uso ao iniciar.
    """

    id: str | None
    project_id: str
    name: str
    goal: str = ""
    start_date: date | None = None
    end_date: date | None = None
    # Duração em dias do ciclo. `None` = personalizada: as datas são postas na
    # mão e não se recalculam sozinhas ao iniciar a sprint.
    duration_days: int | None = None
    status: SprintStatus = SprintStatus.PLANNED
    started_at: datetime | None = None
    completed_at: datetime | None = None

    def __post_init__(self) -> None:
        if not self.name.strip():
            raise ValidationError("Nome da sprint é obrigatório.")
        if (
            self.start_date is not None
            and self.end_date is not None
            and self.end_date < self.start_date
        ):
            raise ValidationError(
                "A data de término da sprint não pode ser anterior à de início."
            )
        if self.duration_days is not None and not 1 <= self.duration_days <= 365:
            raise ValidationError("A duração da sprint deve ficar entre 1 e 365 dias.")

    def window_from(self, start: date) -> tuple[date, date]:
        """Janela da sprint a partir de uma data de início.

        O último dia é `start + duração - 1`: uma sprint de 14 dias que começa
        numa segunda termina no domingo da semana seguinte, contando os 14 dias
        trabalhados — e não no 15º, que é o que `start + 14` daria.
        """
        days = self.duration_days or DEFAULT_SPRINT_DAYS
        return start, start + timedelta(days=days - 1)
