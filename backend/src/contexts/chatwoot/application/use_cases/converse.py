"""Ações do agente sobre uma conversa: responder, resolver, atribuir, etiquetar."""
from __future__ import annotations

from dataclasses import dataclass

from contexts.chatwoot.domain.entities.conversation import (
    CONVERSATION_PRIORITIES,
    CONVERSATION_STATUSES,
    Message,
)
from shared.domain.errors import ValidationError


@dataclass
class SendMessage:
    """Envia resposta ao cliente ou nota interna (`private=True`).

    Nota interna é o mesmo endpoint com `private: true` — o Chatwoot guarda na
    thread mas não entrega ao contato. Mensagem vazia sem anexo é recusada aqui
    e não vira uma ida à API.
    """

    gateway: object

    def execute(
        self,
        *,
        conversation_id: int,
        content: str,
        private: bool = False,
        content_type: str = "text",
        content_attributes: dict | None = None,
        template_params: dict | None = None,
    ) -> Message:
        if not content.strip() and not content_attributes:
            raise ValidationError("A mensagem não pode ser vazia.")
        return self.gateway.send_message(
            conversation_id,
            content=content,
            private=private,
            content_type=content_type,
            content_attributes=content_attributes,
            template_params=template_params,
        )


@dataclass
class ChangeStatus:
    """Abre, resolve, coloca como pendente ou adia (`snoozed`) a conversa."""

    gateway: object

    def execute(
        self, *, conversation_id: int, status: str, snoozed_until: str | None = None
    ) -> dict:
        if status not in CONVERSATION_STATUSES:
            raise ValidationError(
                f"Status inválido: {status}. Use um de {', '.join(CONVERSATION_STATUSES)}."
            )
        if status == "snoozed" and not snoozed_until:
            raise ValidationError("Adiar exige a data/hora de retorno (snoozed_until).")
        return self.gateway.toggle_status(
            conversation_id, status=status, snoozed_until=snoozed_until
        )


@dataclass
class ChangePriority:
    """Define ou limpa a prioridade (`None` remove)."""

    gateway: object

    def execute(self, *, conversation_id: int, priority: str | None) -> dict:
        if priority is not None and priority not in CONVERSATION_PRIORITIES:
            raise ValidationError(
                f"Prioridade inválida: {priority}. "
                f"Use um de {', '.join(CONVERSATION_PRIORITIES)} ou vazio."
            )
        return self.gateway.toggle_priority(conversation_id, priority=priority)


@dataclass
class AssignConversation:
    """Atribui a um agente, a um time, ou remove o responsável."""

    gateway: object

    def execute(
        self,
        *,
        conversation_id: int,
        assignee_id: int | None = None,
        team_id: int | None = None,
    ) -> dict:
        return self.gateway.assign_conversation(
            conversation_id, assignee_id=assignee_id, team_id=team_id
        )


@dataclass
class SetConversationLabels:
    """Substitui as etiquetas da conversa pela lista enviada."""

    gateway: object

    def execute(self, *, conversation_id: int, labels: list[str]) -> list[str]:
        clean = [label.strip() for label in labels if label.strip()]
        return self.gateway.update_conversation_labels(conversation_id, clean)


@dataclass
class SetConversationAttributes:
    """Grava campos personalizados na conversa (inclusive o `deal_id`)."""

    gateway: object

    def execute(self, *, conversation_id: int, attributes: dict) -> dict:
        return self.gateway.update_custom_attributes(conversation_id, attributes)


@dataclass
class ToggleMute:
    """Silencia/reativa notificações da conversa."""

    gateway: object

    def execute(self, *, conversation_id: int, muted: bool) -> dict:
        if muted:
            return self.gateway.mute_conversation(conversation_id)
        return self.gateway.unmute_conversation(conversation_id)


@dataclass
class SignalTyping:
    """Propaga "digitando…" para o widget do cliente."""

    gateway: object

    def execute(self, *, conversation_id: int, typing_on: bool) -> None:
        self.gateway.toggle_typing(conversation_id, typing_on=typing_on)


@dataclass
class MarkConversationSeen:
    """Zera o contador de não lidas ao abrir a conversa."""

    gateway: object

    def execute(self, *, conversation_id: int) -> None:
        self.gateway.mark_seen(conversation_id)


@dataclass
class DeleteMessage:
    """Apaga uma mensagem enviada por engano."""

    gateway: object

    def execute(self, *, conversation_id: int, message_id: int) -> None:
        self.gateway.delete_message(conversation_id, message_id)
