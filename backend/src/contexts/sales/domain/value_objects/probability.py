"""Objeto de valor Probability — chance de fechamento em porcentagem."""
from dataclasses import dataclass

from shared.domain.errors import ValidationError


@dataclass(frozen=True)
class Probability:
    """Probabilidade de ganho do negócio, inteiro de 0 a 100."""

    value: int

    def __post_init__(self) -> None:
        try:
            value = int(self.value)
        except (TypeError, ValueError) as exc:
            raise ValidationError("Probabilidade inválida.") from exc
        if not 0 <= value <= 100:
            raise ValidationError("A probabilidade deve estar entre 0 e 100.")
        object.__setattr__(self, "value", value)

    def __int__(self) -> int:
        return self.value
