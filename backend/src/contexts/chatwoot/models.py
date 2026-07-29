"""Ponto de descoberta de models pelo Django (models reais em infrastructure)."""
from contexts.chatwoot.infrastructure.django.models import (  # noqa: F401
    ChatwootConnectionModel,
    ConversationLinkModel,
    WebhookEventModel,
)
