"""Porta de saída para a API do Chatwoot.

O domínio fala com o Chatwoot só por esta interface — os casos de uso não
sabem que existe HTTP. Em teste entra um duplo em memória; em produção, o
`ChatwootHttpGateway` (infrastructure).
"""
from typing import Protocol

from contexts.chatwoot.domain.entities.catalog import (
    Agent,
    CannedResponse,
    ChatContact,
    CustomAttributeDefinition,
    Inbox,
    Label,
    Team,
)
from contexts.chatwoot.domain.entities.conversation import (
    Conversation,
    ConversationPage,
    Message,
)


class ChatwootGateway(Protocol):
    """Operações da Application API do Chatwoot que o atendimento usa."""

    # ── Identidade / saúde ───────────────────────────────────────────────────
    def verify(self) -> dict:
        """Valida o token e devolve o perfil do agente dono dele."""
        ...

    # ── Conversas ────────────────────────────────────────────────────────────
    def list_conversations(
        self,
        *,
        status: str | None = None,
        assignee_type: str | None = None,
        inbox_id: int | None = None,
        team_id: int | None = None,
        labels: list[str] | None = None,
        query: str | None = None,
        page: int = 1,
    ) -> ConversationPage:
        ...

    def filter_conversations(self, payload: list[dict], *, page: int = 1) -> ConversationPage:
        """Busca avançada (`POST /conversations/filter`) com AND/OR."""
        ...

    def get_conversation(self, conversation_id: int) -> Conversation:
        ...

    def conversation_counts(self) -> dict:
        """Contadores por status para os badges das pastas."""
        ...

    def toggle_status(
        self, conversation_id: int, *, status: str, snoozed_until: str | None = None
    ) -> dict:
        ...

    def toggle_priority(self, conversation_id: int, *, priority: str | None) -> dict:
        ...

    def assign_conversation(
        self, conversation_id: int, *, assignee_id: int | None = None, team_id: int | None = None
    ) -> dict:
        ...

    def update_conversation_labels(self, conversation_id: int, labels: list[str]) -> list[str]:
        ...

    def update_custom_attributes(self, conversation_id: int, attributes: dict) -> dict:
        ...

    def mute_conversation(self, conversation_id: int) -> dict:
        ...

    def unmute_conversation(self, conversation_id: int) -> dict:
        ...

    # ── Mensagens ────────────────────────────────────────────────────────────
    def list_messages(self, conversation_id: int, *, before: int | None = None) -> list[Message]:
        ...

    def send_message(
        self,
        conversation_id: int,
        *,
        content: str,
        private: bool = False,
        content_type: str = "text",
        content_attributes: dict | None = None,
        template_params: dict | None = None,
    ) -> Message:
        ...

    def delete_message(self, conversation_id: int, message_id: int) -> None:
        ...

    def toggle_typing(self, conversation_id: int, *, typing_on: bool) -> None:
        ...

    def mark_seen(self, conversation_id: int) -> None:
        ...

    # ── Contatos ─────────────────────────────────────────────────────────────
    def list_contacts(self, *, page: int = 1, sort: str | None = None) -> list[ChatContact]:
        ...

    def search_contacts(self, query: str, *, page: int = 1) -> list[ChatContact]:
        ...

    def get_contact(self, contact_id: int) -> ChatContact:
        ...

    def create_contact(self, payload: dict) -> ChatContact:
        ...

    def update_contact(self, contact_id: int, payload: dict) -> ChatContact:
        ...

    def contact_conversations(self, contact_id: int) -> list[Conversation]:
        ...

    # ── Catálogos ────────────────────────────────────────────────────────────
    def list_inboxes(self) -> list[Inbox]:
        ...

    def list_agents(self) -> list[Agent]:
        ...

    def list_teams(self) -> list[Team]:
        ...

    def list_labels(self) -> list[Label]:
        ...

    def list_canned_responses(self) -> list[CannedResponse]:
        ...

    def list_custom_attribute_definitions(
        self, *, model: int | None = None
    ) -> list[CustomAttributeDefinition]:
        ...

    # ── Relatórios ───────────────────────────────────────────────────────────
    def reports_summary(self, *, since: str, until: str) -> dict:
        ...
