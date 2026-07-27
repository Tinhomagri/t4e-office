"""Recebimento dos eventos que o Chatwoot empurra para nós.

O Chatwoot manda POST em cada evento assinado (`message_created`,
`conversation_status_changed`…). Guardamos cru e devolvemos ao frontend por
polling — quando o app ganhar WebSocket, é daqui que o broadcast sai.
"""
from __future__ import annotations

import hashlib
import hmac
from dataclasses import dataclass

from shared.domain.errors import PermissionDeniedError

# Eventos que o Chatwoot oferece na criação do webhook. Ignoramos o resto para
# o log não virar lixo se alguém marcar tudo na interface deles.
SUPPORTED_EVENTS = frozenset(
    {
        "conversation_created",
        "conversation_updated",
        "conversation_status_changed",
        "conversation_typing_on",
        "conversation_typing_off",
        "message_created",
        "message_updated",
        "contact_created",
        "contact_updated",
        "webwidget_triggered",
    }
)


def verify_signature(*, secret: str, body: bytes, signature: str) -> bool:
    """Confere o HMAC-SHA256 que o Chatwoot manda em `X-Chatwoot-Signature`.

    Comparação em tempo constante — comparar com `==` vaza o prefixo correto
    byte a byte para quem cronometrar as respostas.
    """
    if not secret or not signature:
        return False
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature.strip())


@dataclass
class IngestWebhook:
    """Valida a origem do evento e registra no log do workspace."""

    connections: object
    events: object

    def execute(
        self,
        *,
        webhook_secret: str,
        payload: dict,
        raw_body: bytes | None = None,
        signature: str | None = None,
    ) -> dict:
        connection = self.connections.find_by_webhook_secret(webhook_secret)
        if connection is None:
            raise PermissionDeniedError("Webhook desconhecido.")

        # A assinatura HMAC é opcional: só existe se o admin configurou um
        # secret no webhook do Chatwoot. Quando existe, tem que bater.
        if signature and raw_body is not None:
            if not verify_signature(
                secret=connection.webhook_secret, body=raw_body, signature=signature
            ):
                raise PermissionDeniedError("Assinatura do webhook inválida.")

        event = str(payload.get("event") or "")
        if event not in SUPPORTED_EVENTS:
            return {"ignored": True, "event": event}

        conversation_id, contact_id = self._extract_ids(event, payload)
        row = self.events.record(
            workspace_id=connection.workspace_id,
            event=event,
            payload=payload,
            conversation_id=conversation_id,
            contact_id=contact_id,
        )
        # O log é cache de tempo real, não histórico: aparar mantém a tabela leve.
        self.events.prune(workspace_id=connection.workspace_id)
        return {"ignored": False, "event": event, "id": str(row.id)}

    @staticmethod
    def _extract_ids(event: str, payload: dict) -> tuple[int | None, int | None]:
        """Puxa conversation_id/contact_id — o formato muda conforme o evento."""
        conversation = payload.get("conversation") or {}
        if event.startswith("conversation_"):
            # Em eventos de conversa o próprio payload É a conversa.
            conversation = conversation or payload

        conversation_id = conversation.get("id") or payload.get("conversation_id")

        contact = payload.get("contact") or (payload.get("meta") or {}).get("sender") or {}
        if event.startswith("contact_"):
            contact = contact or payload
        if not contact:
            contact = (conversation.get("meta") or {}).get("sender") or {}
        contact_id = contact.get("id")

        def _int(value):
            try:
                return int(value) if value is not None else None
            except (TypeError, ValueError):
                return None

        return _int(conversation_id), _int(contact_id)


@dataclass
class PollEvents:
    """Eventos novos desde o último cursor — o frontend chama isso em loop."""

    events: object

    def execute(self, *, workspace_id: str, after_id: str | None = None, limit: int = 50) -> list:
        return self.events.since(workspace_id=workspace_id, after_id=after_id, limit=limit)
