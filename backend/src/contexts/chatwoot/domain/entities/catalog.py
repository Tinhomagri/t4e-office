"""Entidades de apoio do Chatwoot: caixas, agentes, times, labels e respostas.

São listas pequenas e estáveis (mudam quando o admin mexe na configuração),
por isso ficam juntas: quem monta a tela de atendimento precisa das cinco de
uma vez para desenhar filtros, seletor de responsável e atalhos de resposta.
"""
from dataclasses import dataclass, field
from datetime import UTC, datetime

# Tipos de canal que o Chatwoot expõe em `channel_type`. Guardamos o mapa para
# rotular no frontend sem espalhar string mágica.
CHANNEL_LABELS = {
    "Channel::WebWidget": "Chat do site",
    "Channel::Api": "API",
    "Channel::Email": "E-mail",
    "Channel::Whatsapp": "WhatsApp",
    "Channel::TwilioSms": "SMS/WhatsApp (Twilio)",
    "Channel::Sms": "SMS",
    "Channel::FacebookPage": "Facebook",
    "Channel::Instagram": "Instagram",
    "Channel::Telegram": "Telegram",
    "Channel::Line": "Line",
    "Channel::TwitterProfile": "X/Twitter",
    "Channel::Voice": "Voz",
}


@dataclass
class Inbox:
    """Caixa de entrada — um canal conectado (site, WhatsApp, e-mail…)."""

    id: int
    name: str
    channel_type: str = ""
    medium: str = ""
    provider: str = ""
    avatar_url: str = ""
    website_url: str = ""
    phone_number: str = ""
    inbox_identifier: str = ""
    enable_auto_assignment: bool = False
    working_hours_enabled: bool = False
    timezone: str = ""
    greeting_enabled: bool = False
    greeting_message: str = ""
    csat_survey_enabled: bool = False

    @property
    def channel_label(self) -> str:
        """Nome amigável do canal, com fallback para o próprio `channel_type`."""
        return CHANNEL_LABELS.get(self.channel_type, self.channel_type or "Canal")

    @classmethod
    def from_api(cls, raw: dict) -> "Inbox":
        return cls(
            id=int(raw.get("id") or 0),
            name=str(raw.get("name") or ""),
            channel_type=str(raw.get("channel_type") or ""),
            medium=str(raw.get("medium") or ""),
            provider=str(raw.get("provider") or ""),
            avatar_url=str(raw.get("avatar_url") or ""),
            website_url=str(raw.get("website_url") or ""),
            phone_number=str(raw.get("phone_number") or ""),
            inbox_identifier=str(raw.get("inbox_identifier") or ""),
            enable_auto_assignment=bool(raw.get("enable_auto_assignment")),
            working_hours_enabled=bool(raw.get("working_hours_enabled")),
            timezone=str(raw.get("timezone") or ""),
            greeting_enabled=bool(raw.get("greeting_enabled")),
            greeting_message=str(raw.get("greeting_message") or ""),
            csat_survey_enabled=bool(raw.get("csat_survey_enabled")),
        )


@dataclass
class Agent:
    """Agente da conta — quem pode assumir conversa."""

    id: int
    name: str
    email: str = ""
    role: str = "agent"
    avatar_url: str = ""
    availability_status: str = "offline"
    confirmed: bool = True

    @classmethod
    def from_api(cls, raw: dict) -> "Agent":
        return cls(
            id=int(raw.get("id") or 0),
            name=str(raw.get("name") or raw.get("available_name") or ""),
            email=str(raw.get("email") or ""),
            role=str(raw.get("role") or "agent"),
            avatar_url=str(raw.get("thumbnail") or raw.get("avatar_url") or ""),
            availability_status=str(raw.get("availability_status") or "offline"),
            confirmed=bool(raw.get("confirmed", True)),
        )


@dataclass
class Team:
    """Time de atendimento — permite atribuir a um grupo em vez de a uma pessoa."""

    id: int
    name: str
    description: str = ""
    allow_auto_assign: bool = True

    @classmethod
    def from_api(cls, raw: dict) -> "Team":
        return cls(
            id=int(raw.get("id") or 0),
            name=str(raw.get("name") or ""),
            description=str(raw.get("description") or ""),
            allow_auto_assign=bool(raw.get("allow_auto_assign", True)),
        )


@dataclass
class Label:
    """Etiqueta aplicável a conversas e contatos."""

    id: int
    title: str
    description: str = ""
    color: str = "#1f93ff"
    show_on_sidebar: bool = True

    @classmethod
    def from_api(cls, raw: dict) -> "Label":
        return cls(
            id=int(raw.get("id") or 0),
            title=str(raw.get("title") or ""),
            description=str(raw.get("description") or ""),
            color=str(raw.get("color") or "#1f93ff"),
            show_on_sidebar=bool(raw.get("show_on_sidebar", True)),
        )


@dataclass
class CannedResponse:
    """Resposta pronta, disparada no editor com `/atalho`."""

    id: int
    short_code: str
    content: str

    @classmethod
    def from_api(cls, raw: dict) -> "CannedResponse":
        return cls(
            id=int(raw.get("id") or 0),
            short_code=str(raw.get("short_code") or ""),
            content=str(raw.get("content") or ""),
        )


@dataclass
class CustomAttributeDefinition:
    """Definição de campo personalizado (de conversa ou de contato).

    O Chatwoot devolve `attribute_display_type` e `attribute_model` já por
    extenso na leitura, mas espera inteiro na escrita — quem escreve converte.
    """

    id: int
    attribute_key: str
    attribute_display_name: str
    attribute_display_type: str = "text"
    attribute_model: str = "conversation_attribute"
    attribute_description: str = ""
    attribute_values: list[str] = field(default_factory=list)

    @classmethod
    def from_api(cls, raw: dict) -> "CustomAttributeDefinition":
        values = raw.get("attribute_values") or []
        if isinstance(values, str):  # a API às vezes devolve "a,b,c"
            values = [v for v in values.split(",") if v]
        return cls(
            id=int(raw.get("id") or 0),
            attribute_key=str(raw.get("attribute_key") or ""),
            attribute_display_name=str(raw.get("attribute_display_name") or ""),
            attribute_display_type=str(raw.get("attribute_display_type") or "text"),
            attribute_model=str(raw.get("attribute_model") or "conversation_attribute"),
            attribute_description=str(raw.get("attribute_description") or ""),
            attribute_values=[str(v) for v in values],
        )


@dataclass
class ChatContact:
    """Contato completo do Chatwoot (a pessoa do outro lado da conversa)."""

    id: int
    name: str
    email: str = ""
    phone_number: str = ""
    identifier: str = ""
    avatar_url: str = ""
    blocked: bool = False
    availability_status: str = "offline"
    additional_attributes: dict = field(default_factory=dict)
    custom_attributes: dict = field(default_factory=dict)
    last_activity_at: datetime | None = None
    created_at: datetime | None = None

    @property
    def city(self) -> str:
        return str(self.additional_attributes.get("city") or "")

    @property
    def country(self) -> str:
        return str(self.additional_attributes.get("country") or "")

    @property
    def company_name(self) -> str:
        return str(self.additional_attributes.get("company_name") or "")

    @classmethod
    def from_api(cls, raw: dict) -> "ChatContact":
        def _dt(value):
            if not value:
                return None
            return datetime.fromtimestamp(float(value), tz=UTC)

        return cls(
            id=int(raw.get("id") or 0),
            name=str(raw.get("name") or ""),
            email=str(raw.get("email") or ""),
            phone_number=str(raw.get("phone_number") or ""),
            identifier=str(raw.get("identifier") or ""),
            avatar_url=str(raw.get("thumbnail") or raw.get("avatar_url") or ""),
            blocked=bool(raw.get("blocked")),
            availability_status=str(raw.get("availability_status") or "offline"),
            additional_attributes=raw.get("additional_attributes") or {},
            custom_attributes=raw.get("custom_attributes") or {},
            last_activity_at=_dt(raw.get("last_activity_at")),
            created_at=_dt(raw.get("created_at")),
        )
