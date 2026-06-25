"""Value object de email."""
import re
from dataclasses import dataclass

from shared.domain.errors import ValidationError

# Regex pragmática para validação de formato de email
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


@dataclass(frozen=True)
class Email:
    """Email validado e normalizado (minúsculo, sem espaços)."""

    value: str

    def __post_init__(self) -> None:
        normalized = self.value.strip().lower()
        if not _EMAIL_RE.match(normalized):
            raise ValidationError("Email inválido.")
        # frozen=True exige object.__setattr__ para normalizar
        object.__setattr__(self, "value", normalized)

    def __str__(self) -> str:
        return self.value
