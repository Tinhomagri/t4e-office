"""Persistência do contexto chatwoot: conexão, vínculos e eventos."""
from __future__ import annotations

import secrets

from django.utils import timezone

from contexts.chatwoot.domain.entities.connection import ChatwootConnection
from contexts.chatwoot.infrastructure.django.crypto import decrypt, encrypt
from contexts.chatwoot.infrastructure.django.models import (
    ChatwootConnectionModel,
    ConversationLinkModel,
    WebhookEventModel,
)
from shared.domain.errors import NotFoundError


def _to_entity(row: ChatwootConnectionModel) -> ChatwootConnection:
    return ChatwootConnection(
        id=str(row.id),
        workspace_id=str(row.workspace_id),
        base_url=row.base_url,
        account_id=row.account_id,
        access_token=decrypt(row.access_token_encrypted),
        webhook_secret=row.webhook_secret,
        status=row.status,
        last_error=row.last_error,
        last_verified_at=row.last_verified_at,
        agent_name=row.agent_name,
        agent_email=row.agent_email,
    )


class DjangoConnectionRepository:
    """Uma conexão por workspace, com o token cifrado em repouso."""

    def get(self, workspace_id: str) -> ChatwootConnection | None:
        row = ChatwootConnectionModel.objects.filter(workspace_id=workspace_id).first()
        return _to_entity(row) if row else None

    def require(self, workspace_id: str) -> ChatwootConnection:
        conn = self.get(workspace_id)
        if conn is None:
            raise NotFoundError(
                "Este workspace ainda não tem uma instância Chatwoot conectada."
            )
        return conn

    def upsert(
        self,
        *,
        workspace_id: str,
        base_url: str,
        account_id: int,
        access_token: str,
        user_id: str | None = None,
    ) -> ChatwootConnection:
        """Cria ou atualiza a conexão. Token vazio mantém o que já estava salvo."""
        # Valida as invariantes antes de tocar no banco.
        ChatwootConnection(
            id=None,
            workspace_id=workspace_id,
            base_url=base_url,
            account_id=account_id,
            access_token=access_token,
        )
        row = ChatwootConnectionModel.objects.filter(workspace_id=workspace_id).first()
        if row is None:
            row = ChatwootConnectionModel(
                workspace_id=workspace_id,
                webhook_secret=secrets.token_urlsafe(32),
                created_by_id=user_id,
            )
        row.base_url = base_url.strip().rstrip("/")
        row.account_id = account_id
        if access_token:
            row.access_token_encrypted = encrypt(access_token)
        if not row.webhook_secret:
            row.webhook_secret = secrets.token_urlsafe(32)
        row.save()
        return _to_entity(row)

    def mark_verified(self, workspace_id: str, *, agent: dict) -> ChatwootConnection:
        row = ChatwootConnectionModel.objects.get(workspace_id=workspace_id)
        row.status = "connected"
        row.last_error = ""
        row.last_verified_at = timezone.now()
        row.agent_name = str(agent.get("name") or agent.get("available_name") or "")
        row.agent_email = str(agent.get("email") or "")
        row.save(
            update_fields=[
                "status",
                "last_error",
                "last_verified_at",
                "agent_name",
                "agent_email",
                "updated_at",
            ]
        )
        return _to_entity(row)

    def mark_error(self, workspace_id: str, message: str) -> None:
        ChatwootConnectionModel.objects.filter(workspace_id=workspace_id).update(
            status="error", last_error=message[:500], updated_at=timezone.now()
        )

    def delete(self, workspace_id: str) -> None:
        ChatwootConnectionModel.objects.filter(workspace_id=workspace_id).delete()

    def find_by_webhook_secret(self, secret: str) -> ChatwootConnection | None:
        row = ChatwootConnectionModel.objects.filter(webhook_secret=secret).first()
        return _to_entity(row) if row else None


class DjangoConversationLinkRepository:
    """Ponte conversa ↔ negócio/cliente do funil."""

    def get(self, *, workspace_id: str, conversation_id: int) -> ConversationLinkModel | None:
        return ConversationLinkModel.objects.filter(
            workspace_id=workspace_id, conversation_id=conversation_id
        ).first()

    def map_for(self, *, workspace_id: str, conversation_ids: list[int]) -> dict[int, dict]:
        """Vínculos de várias conversas de uma vez — evita N+1 na listagem."""
        if not conversation_ids:
            return {}
        rows = ConversationLinkModel.objects.filter(
            workspace_id=workspace_id, conversation_id__in=conversation_ids
        ).select_related("deal", "customer")
        return {
            row.conversation_id: {
                "deal_id": str(row.deal_id) if row.deal_id else None,
                "deal_title": row.deal.title if row.deal else "",
                "customer_id": str(row.customer_id) if row.customer_id else None,
                "customer_name": row.customer.name if row.customer else "",
            }
            for row in rows
        }

    def link(
        self,
        *,
        workspace_id: str,
        conversation_id: int,
        deal_id: str | None,
        customer_id: str | None,
        user_id: str | None = None,
    ) -> ConversationLinkModel:
        row, _created = ConversationLinkModel.objects.update_or_create(
            workspace_id=workspace_id,
            conversation_id=conversation_id,
            defaults={
                "deal_id": deal_id,
                "customer_id": customer_id,
                "linked_by_id": user_id,
            },
        )
        return row

    def unlink(self, *, workspace_id: str, conversation_id: int) -> None:
        ConversationLinkModel.objects.filter(
            workspace_id=workspace_id, conversation_id=conversation_id
        ).delete()

    def conversations_of_deal(self, deal_id: str) -> list[int]:
        return list(
            ConversationLinkModel.objects.filter(deal_id=deal_id).values_list(
                "conversation_id", flat=True
            )
        )

    def conversations_of_customer(self, customer_id: str) -> list[int]:
        return list(
            ConversationLinkModel.objects.filter(customer_id=customer_id).values_list(
                "conversation_id", flat=True
            )
        )


class DjangoWebhookEventRepository:
    """Log de eventos recebidos — alimenta o polling do frontend."""

    def record(
        self,
        *,
        workspace_id: str,
        event: str,
        payload: dict,
        conversation_id: int | None,
        contact_id: int | None,
    ) -> WebhookEventModel:
        return WebhookEventModel.objects.create(
            workspace_id=workspace_id,
            event=event,
            payload=payload,
            conversation_id=conversation_id,
            contact_id=contact_id,
        )

    def since(self, *, workspace_id: str, after_id: str | None, limit: int = 50) -> list[WebhookEventModel]:
        """Eventos mais recentes que `after_id` (cursor por created_at)."""
        qs = WebhookEventModel.objects.filter(workspace_id=workspace_id)
        if after_id:
            anchor = WebhookEventModel.objects.filter(id=after_id).first()
            if anchor:
                qs = qs.filter(created_at__gt=anchor.created_at)
        return list(qs.order_by("-created_at")[:limit])

    def prune(self, *, workspace_id: str, keep: int = 500) -> int:
        """Mantém só os N eventos mais recentes — o log é cache, não histórico."""
        ids = list(
            WebhookEventModel.objects.filter(workspace_id=workspace_id)
            .order_by("-created_at")
            .values_list("id", flat=True)[:keep]
        )
        deleted, _ = (
            WebhookEventModel.objects.filter(workspace_id=workspace_id)
            .exclude(id__in=ids)
            .delete()
        )
        return deleted
