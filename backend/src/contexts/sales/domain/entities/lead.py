"""Entidade de lead — Python puro."""
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from enum import Enum

from shared.domain.errors import ValidationError

# SLA de primeiro contato: prazo padrão entre a captação do lead e o primeiro
# toque do responsável. Fixo por ora — vira configurável por workspace se a
# necessidade aparecer, mas até lá não vale a abstração.
FIRST_CONTACT_SLA_HOURS = 24


class LeadStatus(str, Enum):
    """Estado do lead na esteira de qualificação."""

    NEW = "new"
    CONTACTED = "contacted"
    QUALIFYING = "qualifying"
    QUALIFIED = "qualified"
    DISQUALIFIED = "disqualified"
    CONVERTED = "converted"


@dataclass
class Lead:
    """Contato captado antes de virar cliente — não tem `customer_id` até a conversão.

    Existe uma entidade própria (em vez de um `Deal` com `customer_id` opcional)
    porque um lead pode nunca virar negócio: a maioria é desqualificada, e um
    `Deal` sempre pressupõe um cliente e um valor — coisas que um lead ainda não
    tem.
    """

    id: str | None
    workspace_id: str
    name: str
    company: str = ""
    email: str = ""
    phone: str = ""
    source: str = ""  # site, indicação, evento, importação CSV…
    score: int = 0  # 0–100, atribuído na qualificação
    status: LeadStatus = LeadStatus.NEW
    disqualify_reason: str = ""
    owner_id: str | None = None
    notes: str = ""
    first_contact_due_at: datetime | None = None
    contacted_at: datetime | None = None
    converted_at: datetime | None = None
    converted_deal_id: str | None = None
    converted_customer_id: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    def __post_init__(self) -> None:
        if not self.name.strip():
            raise ValidationError("Nome do lead é obrigatório.")
        if not 0 <= self.score <= 100:
            raise ValidationError("Score deve estar entre 0 e 100.")
        if self.status == LeadStatus.DISQUALIFIED and not self.disqualify_reason.strip():
            raise ValidationError("Motivo do descarte é obrigatório.")
        # created_at só existe depois do primeiro save (o repositório o define);
        # antes disso, o SLA se apoia em "agora" para o cálculo de vencimento.
        if self.first_contact_due_at is None:
            base = self.created_at or datetime.now(UTC)
            self.first_contact_due_at = base + timedelta(hours=FIRST_CONTACT_SLA_HOURS)

    @property
    def is_open(self) -> bool:
        """Ainda está na esteira — não foi descartado nem convertido."""
        return self.status not in (LeadStatus.DISQUALIFIED, LeadStatus.CONVERTED)

    @property
    def is_overdue(self) -> bool:
        """Passou do prazo de primeiro contato sem ter sido contatado.

        Uma vez contatado (ou fora da esteira), o SLA já foi cumprido ou deixou
        de valer — não fica "vencido para sempre".
        """
        if self.contacted_at is not None or not self.is_open:
            return False
        if self.first_contact_due_at is None:
            return False
        return datetime.now(UTC) > self.first_contact_due_at

    def assert_convertible(self) -> None:
        if self.status == LeadStatus.CONVERTED:
            raise ValidationError("Lead já foi convertido.")
        if self.status == LeadStatus.DISQUALIFIED:
            raise ValidationError("Lead desqualificado não pode ser convertido.")

    def assert_qualifiable(self) -> None:
        if self.status == LeadStatus.CONVERTED:
            raise ValidationError("Lead já convertido não pode ser requalificado.")

    def mark_contacted(self, *, when: datetime | None = None) -> None:
        self.contacted_at = when or datetime.now(UTC)
        if self.status == LeadStatus.NEW:
            self.status = LeadStatus.CONTACTED

    def qualify(self, *, score: int) -> None:
        self.assert_qualifiable()
        if not 0 <= score <= 100:
            raise ValidationError("Score deve estar entre 0 e 100.")
        self.score = score
        self.status = LeadStatus.QUALIFIED
        self.disqualify_reason = ""

    def disqualify(self, *, reason: str) -> None:
        if not reason.strip():
            raise ValidationError("Motivo do descarte é obrigatório.")
        self.status = LeadStatus.DISQUALIFIED
        self.disqualify_reason = reason

    def mark_converted(self, *, deal_id: str, customer_id: str) -> None:
        self.assert_convertible()
        self.status = LeadStatus.CONVERTED
        self.converted_at = datetime.now(UTC)
        self.converted_deal_id = deal_id
        self.converted_customer_id = customer_id
