"""Objeto de valor Money — valor monetário imutável com moeda."""
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation

from shared.domain.errors import ValidationError

# Moedas aceitas no v1 do comercial.
SUPPORTED_CURRENCIES = ("BRL", "USD", "EUR")


@dataclass(frozen=True)
class Money:
    """Valor monetário não negativo, com moeda."""

    amount: Decimal
    currency: str = "BRL"

    def __post_init__(self) -> None:
        try:
            amount = Decimal(self.amount)
        except (InvalidOperation, TypeError, ValueError) as exc:
            raise ValidationError("Valor monetário inválido.") from exc
        if amount < 0:
            raise ValidationError("O valor do negócio não pode ser negativo.")
        currency = str(self.currency).upper()
        if currency not in SUPPORTED_CURRENCIES:
            raise ValidationError("Moeda não suportada.")
        # Frozen dataclass: normaliza via object.__setattr__
        object.__setattr__(self, "amount", amount)
        object.__setattr__(self, "currency", currency)

    def weighted(self, probability: int) -> Decimal:
        """Valor ponderado pela probabilidade (0–100), usado no forecast do funil."""
        return (self.amount * Decimal(probability)) / Decimal(100)

    def __str__(self) -> str:
        return f"{self.currency} {self.amount}"
