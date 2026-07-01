"""Entidade de sprint (ciclo de trabalho) — Python puro."""
from dataclasses import dataclass
from datetime import date
from enum import Enum

from shared.domain.errors import ValidationError


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
    status: SprintStatus = SprintStatus.PLANNED

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
