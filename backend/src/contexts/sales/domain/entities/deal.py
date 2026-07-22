"""Entidade de negócio (deal) do funil comercial — Python puro."""
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal

from contexts.sales.domain.value_objects.money import Money
from contexts.sales.domain.value_objects.probability import Probability
from shared.domain.errors import ValidationError


@dataclass
class Deal:
    """Oportunidade de venda pertencente a um workspace.

    `delivery_project_id` guarda o projeto de entrega gerado ao ganhar o negócio;
    é apenas um id — `sales` não conhece o model de `projects`.
    """

    id: str | None
    workspace_id: str
    title: str
    customer_id: str
    stage_id: str
    contact_id: str | None = None
    amount: Decimal = Decimal("0")
    currency: str = "BRL"
    probability: int = 0
    expected_close_date: date | None = None
    source: str = ""  # origem do lead (indicação, site, evento…)
    owner_id: str | None = None
    lost_reason: str = ""
    lost_notes: str = ""
    won_at: datetime | None = None
    lost_at: datetime | None = None
    delivery_project_id: str | None = None
    rank: str = ""  # Lexorank — ordenação estável na coluna do Kanban
    # Denormalizado apenas para leitura: evita N+1 no card do Kanban.
    customer_name: str = ""
    created_at: datetime | None = None
    updated_at: datetime | None = None

    def __post_init__(self) -> None:
        if not self.title.strip():
            raise ValidationError("Título do negócio é obrigatório.")
        # Delega as invariantes de valor e probabilidade aos objetos de valor
        money = Money(amount=self.amount, currency=self.currency)
        self.amount = money.amount
        self.currency = money.currency
        self.probability = Probability(self.probability).value

    @property
    def money(self) -> Money:
        """Valor do negócio como objeto de valor."""
        return Money(amount=self.amount, currency=self.currency)

    @property
    def weighted_amount(self) -> Decimal:
        """Valor ponderado pela probabilidade — soma no cabeçalho da coluna."""
        return self.money.weighted(self.probability)

    @property
    def is_closed(self) -> bool:
        """Indica se o negócio já foi fechado (ganho ou perdido)."""
        return self.won_at is not None or self.lost_at is not None
