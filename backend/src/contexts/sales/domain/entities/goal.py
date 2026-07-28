"""Entidade de meta comercial (quota) — Python puro."""
import re
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

from contexts.sales.domain.value_objects.money import Money
from shared.domain.errors import ValidationError

_PERIOD_RE = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")


@dataclass
class Goal:
    """Meta de faturamento de um workspace num mês, geral ou por vendedor.

    `owner_id` None representa a meta geral do workspace no período;
    quando preenchido, é a meta individual daquele vendedor.
    """

    id: str | None
    workspace_id: str
    period: str  # "YYYY-MM"
    target_amount: Decimal
    currency: str = "BRL"
    owner_id: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    def __post_init__(self) -> None:
        if not _PERIOD_RE.match(self.period or ""):
            raise ValidationError("Período da meta deve estar no formato AAAA-MM.")
        money = Money(amount=self.target_amount, currency=self.currency)
        if money.amount <= 0:
            raise ValidationError("Valor da meta deve ser maior que zero.")
        self.target_amount = money.amount
        self.currency = money.currency
