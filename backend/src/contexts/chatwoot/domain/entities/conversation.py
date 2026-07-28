"""Conversa e mensagem do Chatwoot — read models tipados sobre o JSON da API.

O Chatwoot devolve um JSON grande e com formatos que mudam entre endpoints
(ex.: `messages` só vem no detalhe, `meta.sender` só na listagem). Estas
entidades normalizam isso num formato único que o resto do sistema consome.
"""
from dataclasses import dataclass, field
from datetime import UTC, datetime

# Espelham os inteiros do Chatwoot: a API troca message_type por número.
MESSAGE_TYPE_INCOMING = 0
MESSAGE_TYPE_OUTGOING = 1
MESSAGE_TYPE_ACTIVITY = 2
MESSAGE_TYPE_TEMPLATE = 3

MESSAGE_TYPE_NAMES = {
    MESSAGE_TYPE_INCOMING: "incoming",
    MESSAGE_TYPE_OUTGOING: "outgoing",
    MESSAGE_TYPE_ACTIVITY: "activity",
    MESSAGE_TYPE_TEMPLATE: "template",
}

# Status válidos de conversa na API deles.
CONVERSATION_STATUSES = ("open", "resolved", "pending", "snoozed")
# Prioridades (null = sem prioridade).
CONVERSATION_PRIORITIES = ("urgent", "high", "medium", "low")


def epoch_to_dt(value: int | float | None) -> datetime | None:
    """Converte timestamp Unix do Chatwoot em datetime aware (UTC)."""
    if not value:
        return None
    return datetime.fromtimestamp(float(value), tz=UTC)


@dataclass
class Attachment:
    """Anexo de mensagem (imagem, áudio, arquivo…)."""

    id: int
    file_type: str
    data_url: str
    thumb_url: str = ""
    file_size: int = 0

    @classmethod
    def from_api(cls, raw: dict) -> "Attachment":
        return cls(
            id=int(raw.get("id") or 0),
            file_type=str(raw.get("file_type") or "file"),
            data_url=str(raw.get("data_url") or ""),
            thumb_url=str(raw.get("thumb_url") or ""),
            file_size=int(raw.get("file_size") or 0),
        )


@dataclass
class MessageSender:
    """Quem mandou: contato, agente ou bot."""

    id: int | None
    name: str
    kind: str  # contact | user | agent_bot
    avatar_url: str = ""
    email: str = ""

    @classmethod
    def from_api(cls, raw: dict | None) -> "MessageSender | None":
        if not raw:
            return None
        # A API usa "type" na listagem pública e "available_name"/"name" no resto.
        kind = str(raw.get("type") or "").lower()
        if not kind:
            kind = "contact" if raw.get("identifier") is not None else "user"
        return cls(
            id=int(raw["id"]) if raw.get("id") is not None else None,
            name=str(raw.get("name") or raw.get("available_name") or ""),
            kind=kind,
            avatar_url=str(raw.get("thumbnail") or raw.get("avatar_url") or ""),
            email=str(raw.get("email") or ""),
        )


@dataclass
class Message:
    """Mensagem de uma conversa."""

    id: int
    conversation_id: int
    content: str
    message_type: int
    content_type: str = "text"
    content_attributes: dict = field(default_factory=dict)
    private: bool = False
    status: str = "sent"
    source_id: str = ""
    created_at: datetime | None = None
    sender: MessageSender | None = None
    attachments: list[Attachment] = field(default_factory=list)

    @property
    def direction(self) -> str:
        """`incoming` | `outgoing` | `activity` | `template` — o inteiro por extenso."""
        return MESSAGE_TYPE_NAMES.get(self.message_type, "unknown")

    @property
    def is_note(self) -> bool:
        """Nota interna: sai como outgoing mas o cliente nunca vê."""
        return self.private

    @classmethod
    def from_api(cls, raw: dict, *, conversation_id: int | None = None) -> "Message":
        return cls(
            id=int(raw.get("id") or 0),
            conversation_id=int(raw.get("conversation_id") or conversation_id or 0),
            content=str(raw.get("content") or ""),
            message_type=int(raw.get("message_type") or 0),
            content_type=str(raw.get("content_type") or "text"),
            content_attributes=raw.get("content_attributes") or {},
            private=bool(raw.get("private")),
            status=str(raw.get("status") or "sent"),
            source_id=str(raw.get("source_id") or ""),
            created_at=epoch_to_dt(raw.get("created_at")),
            sender=MessageSender.from_api(raw.get("sender")),
            attachments=[Attachment.from_api(a) for a in (raw.get("attachments") or [])],
        )


@dataclass
class ConversationParticipant:
    """Agente atribuído ou time responsável pela conversa."""

    id: int | None
    name: str
    avatar_url: str = ""
    email: str = ""

    @classmethod
    def from_api(cls, raw: dict | None) -> "ConversationParticipant | None":
        if not raw or raw.get("id") is None:
            return None
        return cls(
            id=int(raw["id"]),
            name=str(raw.get("name") or raw.get("available_name") or ""),
            avatar_url=str(raw.get("thumbnail") or raw.get("avatar_url") or ""),
            email=str(raw.get("email") or ""),
        )


@dataclass
class Conversation:
    """Conversa (thread) numa caixa de entrada do Chatwoot."""

    id: int
    inbox_id: int
    status: str
    uuid: str = ""
    priority: str | None = None
    labels: list[str] = field(default_factory=list)
    custom_attributes: dict = field(default_factory=dict)
    additional_attributes: dict = field(default_factory=dict)
    unread_count: int = 0
    can_reply: bool = True
    muted: bool = False
    snoozed_until: datetime | None = None
    created_at: datetime | None = None
    last_activity_at: datetime | None = None
    waiting_since: datetime | None = None
    contact: "ChatContactSummary | None" = None
    assignee: ConversationParticipant | None = None
    team: ConversationParticipant | None = None
    channel: str = ""
    last_message: Message | None = None
    messages: list[Message] = field(default_factory=list)

    @property
    def deal_id(self) -> str:
        """Negócio vinculado, espelhado em `custom_attributes.deal_id`."""
        return str(self.custom_attributes.get("deal_id") or "")

    @classmethod
    def from_api(cls, raw: dict) -> "Conversation":
        meta = raw.get("meta") or {}
        messages = [
            Message.from_api(m, conversation_id=int(raw.get("id") or 0))
            for m in (raw.get("messages") or [])
        ]
        # A listagem manda só a última mensagem dentro de `messages`; o detalhe
        # manda o histórico. Em ambos os casos a última é a mais recente.
        last = messages[-1] if messages else None
        return cls(
            id=int(raw.get("id") or 0),
            inbox_id=int(raw.get("inbox_id") or 0),
            status=str(raw.get("status") or "open"),
            uuid=str(raw.get("uuid") or ""),
            priority=raw.get("priority") or None,
            labels=list(raw.get("labels") or []),
            custom_attributes=raw.get("custom_attributes") or {},
            additional_attributes=raw.get("additional_attributes") or {},
            unread_count=int(raw.get("unread_count") or 0),
            can_reply=bool(raw.get("can_reply", True)),
            muted=bool(raw.get("muted")),
            snoozed_until=epoch_to_dt(raw.get("snoozed_until")),
            created_at=epoch_to_dt(raw.get("created_at")),
            last_activity_at=epoch_to_dt(raw.get("last_activity_at")),
            waiting_since=epoch_to_dt(raw.get("waiting_since")),
            contact=ChatContactSummary.from_api(meta.get("sender")),
            assignee=ConversationParticipant.from_api(meta.get("assignee")),
            team=ConversationParticipant.from_api(meta.get("team")),
            channel=str(meta.get("channel") or ""),
            last_message=last,
            messages=messages,
        )


@dataclass
class ChatContactSummary:
    """Resumo do contato como vem embutido em `meta.sender` da conversa."""

    id: int
    name: str
    email: str = ""
    phone_number: str = ""
    identifier: str = ""
    avatar_url: str = ""
    additional_attributes: dict = field(default_factory=dict)
    custom_attributes: dict = field(default_factory=dict)

    @classmethod
    def from_api(cls, raw: dict | None) -> "ChatContactSummary | None":
        if not raw or raw.get("id") is None:
            return None
        return cls(
            id=int(raw["id"]),
            name=str(raw.get("name") or ""),
            email=str(raw.get("email") or ""),
            phone_number=str(raw.get("phone_number") or ""),
            identifier=str(raw.get("identifier") or ""),
            avatar_url=str(raw.get("thumbnail") or raw.get("avatar_url") or ""),
            additional_attributes=raw.get("additional_attributes") or {},
            custom_attributes=raw.get("custom_attributes") or {},
        )


@dataclass
class ConversationPage:
    """Página de conversas + os contadores que o Chatwoot devolve em `meta`."""

    conversations: list[Conversation] = field(default_factory=list)
    mine_count: int = 0
    unassigned_count: int = 0
    assigned_count: int = 0
    all_count: int = 0

    @classmethod
    def from_api(cls, raw: dict) -> "ConversationPage":
        # `GET /conversations` embrulha em `data`; `POST /conversations/filter`
        # às vezes devolve `payload` na raiz. Aceitamos os dois.
        data = raw.get("data") if isinstance(raw.get("data"), dict) else raw
        meta = data.get("meta") or {}
        return cls(
            conversations=[Conversation.from_api(c) for c in (data.get("payload") or [])],
            mine_count=int(meta.get("mine_count") or 0),
            unassigned_count=int(meta.get("unassigned_count") or 0),
            assigned_count=int(meta.get("assigned_count") or 0),
            all_count=int(meta.get("all_count") or 0),
        )
