"""Proposta comercial (orçamento) — Python puro.

A proposta nasce de um negócio do funil e carrega itens de linha. Todo o
dinheiro é calculado aqui, nunca no serializer nem no frontend: se o total
puder ser calculado em dois lugares, uma hora os dois discordam e o cliente
recebe um PDF com valor diferente do que está na tela.

Arredondamento: cada linha é quantizada em 2 casas ANTES de somar. Somar em
precisão cheia e arredondar no fim faz o total divergir da soma visível das
linhas — o cliente confere na mão e acha erro.
"""
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

from contexts.sales.domain.value_objects.money import SUPPORTED_CURRENCIES
from shared.domain.errors import ConflictError, ValidationError

CENTS = Decimal("0.01")

# Ciclo de vida. `expired` é derivado de `valid_until`, não gravado por ação
# do usuário — ver `is_expired`.
PROPOSAL_STATUSES = ("draft", "sent", "accepted", "rejected")


def money(value) -> Decimal:
    """Converte para Decimal com 2 casas, recusando lixo."""
    try:
        return Decimal(str(value)).quantize(CENTS, rounding=ROUND_HALF_UP)
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise ValidationError("Valor monetário inválido.") from exc


@dataclass
class ProposalLineItem:
    """Uma linha do orçamento: descrição, quantidade e valor unitário."""

    id: str | None
    description: str
    quantity: Decimal = Decimal("1")
    unit_price: Decimal = Decimal("0")
    # Ordem de exibição na tabela do PDF.
    position: int = 0

    def __post_init__(self) -> None:
        if not self.description.strip():
            raise ValidationError("A descrição do item é obrigatória.")
        try:
            quantity = Decimal(str(self.quantity))
        except (InvalidOperation, TypeError, ValueError) as exc:
            raise ValidationError("Quantidade inválida.") from exc
        if quantity <= 0:
            raise ValidationError("A quantidade deve ser maior que zero.")
        # 4 casas na quantidade: cobre hora fracionada (0,25h) sem virar dízima.
        self.quantity = quantity.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)

        unit_price = money(self.unit_price)
        if unit_price < 0:
            raise ValidationError("O valor unitário não pode ser negativo.")
        self.unit_price = unit_price
        self.description = self.description.strip()

    @property
    def subtotal(self) -> Decimal:
        """Quantidade × valor unitário, já em centavos fechados."""
        return (self.quantity * self.unit_price).quantize(CENTS, rounding=ROUND_HALF_UP)


@dataclass
class Proposal:
    """Orçamento enviado ao cliente, derivado de um negócio do funil."""

    id: str | None
    workspace_id: str
    deal_id: str
    title: str
    # Número sequencial por workspace — o que o cliente cita no e-mail.
    number: int = 0
    status: str = "draft"
    currency: str = "BRL"
    discount: Decimal = Decimal("0")
    intro: str = ""
    terms: str = ""
    valid_until: date | None = None
    items: list[ProposalLineItem] = field(default_factory=list)
    sent_at: datetime | None = None
    accepted_at: datetime | None = None
    rejected_at: datetime | None = None
    rejection_reason: str = ""
    sent_to: str = ""
    created_by_id: str | None = None
    # Denormalizados só para leitura (cabeçalho do PDF e da lista).
    deal_title: str = ""
    customer_name: str = ""
    created_at: datetime | None = None
    updated_at: datetime | None = None

    def __post_init__(self) -> None:
        if not self.title.strip():
            raise ValidationError("O título da proposta é obrigatório.")
        self.title = self.title.strip()

        currency = str(self.currency).upper()
        if currency not in SUPPORTED_CURRENCIES:
            raise ValidationError("Moeda não suportada.")
        self.currency = currency

        if self.status not in PROPOSAL_STATUSES:
            raise ValidationError(f"Status de proposta inválido: {self.status}.")

        discount = money(self.discount)
        if discount < 0:
            raise ValidationError("O desconto não pode ser negativo.")
        self.discount = discount

        # Só valida contra o subtotal quando já há itens: a proposta é criada
        # vazia e ganha linhas depois.
        if self.items and discount > self.subtotal:
            raise ValidationError("O desconto não pode ser maior que o subtotal.")

    # ── Dinheiro ─────────────────────────────────────────────────────────────
    @property
    def subtotal(self) -> Decimal:
        """Soma das linhas, cada uma já fechada em centavos."""
        return sum((item.subtotal for item in self.items), Decimal("0")).quantize(
            CENTS, rounding=ROUND_HALF_UP
        )

    @property
    def total(self) -> Decimal:
        """Subtotal menos desconto. Nunca negativo."""
        result = self.subtotal - self.discount
        return result if result > 0 else Decimal("0.00")

    # ── Estado ───────────────────────────────────────────────────────────────
    @property
    def is_expired(self) -> bool:
        """Venceu a validade sem ter sido decidida.

        Derivado, não gravado: uma proposta aceita depois do prazo continua
        aceita, e reabrir o prazo não exige rodar migração de dados.
        """
        if self.valid_until is None:
            return False
        if self.status in ("accepted", "rejected"):
            return False
        return date.today() > self.valid_until

    @property
    def is_editable(self) -> bool:
        """Aceita e recusada viram documento histórico — não se mexe mais."""
        return self.status in ("draft", "sent")

    def assert_editable(self) -> None:
        if not self.is_editable:
            raise ConflictError(
                "Esta proposta já foi decidida pelo cliente e não pode mais ser alterada."
            )

    def assert_sendable(self) -> None:
        """Enviar orçamento sem item é o erro mais fácil de cometer e o mais feio."""
        if not self.items:
            raise ValidationError("Adicione ao menos um item antes de enviar a proposta.")
        if self.status in ("accepted", "rejected"):
            raise ConflictError("Esta proposta já foi decidida pelo cliente.")

    def assert_decidable(self) -> None:
        """Só dá para aceitar/recusar o que o cliente recebeu."""
        if self.status == "draft":
            raise ConflictError(
                "Esta proposta ainda é um rascunho — envie ao cliente antes de registrar a decisão."
            )
        if self.status in ("accepted", "rejected"):
            raise ConflictError("Esta proposta já foi decidida.")
