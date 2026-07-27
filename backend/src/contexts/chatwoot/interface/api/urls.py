"""Rotas do contexto chatwoot (prefixo /api/chatwoot/)."""
from django.urls import path

from contexts.chatwoot.interface.api.views import (
    CatalogView,
    ConnectionTestView,
    ConnectionView,
    ContactConversationsView,
    ContactDetailView,
    ContactListView,
    ConversationAssignView,
    ConversationAttributesView,
    ConversationCountsView,
    ConversationDetailView,
    ConversationFilterView,
    ConversationLabelsView,
    ConversationLinkView,
    ConversationListView,
    ConversationMessagesView,
    ConversationMuteView,
    ConversationPriorityView,
    ConversationSeenView,
    ConversationStatusView,
    ConversationTypingView,
    CustomerConversationsView,
    DealConversationsView,
    EventStreamView,
    MessageDetailView,
)
from contexts.chatwoot.interface.api.webhook_views import ChatwootWebhookView

urlpatterns = [
    # Conexão
    path("connection/", ConnectionView.as_view(), name="chatwoot-connection"),
    path("connection/test/", ConnectionTestView.as_view(), name="chatwoot-connection-test"),
    # Catálogo da conta (caixas, agentes, times, etiquetas, respostas prontas)
    path("catalog/", CatalogView.as_view(), name="chatwoot-catalog"),
    # Conversas
    path("conversations/", ConversationListView.as_view(), name="chatwoot-conversation-list"),
    path("conversations/filter/", ConversationFilterView.as_view(), name="chatwoot-conversation-filter"),
    path("conversations/counts/", ConversationCountsView.as_view(), name="chatwoot-conversation-counts"),
    path("conversations/<int:conversation_id>/", ConversationDetailView.as_view(), name="chatwoot-conversation-detail"),
    path("conversations/<int:conversation_id>/messages/", ConversationMessagesView.as_view(), name="chatwoot-messages"),
    path("conversations/<int:conversation_id>/messages/<int:message_id>/", MessageDetailView.as_view(), name="chatwoot-message-detail"),
    path("conversations/<int:conversation_id>/status/", ConversationStatusView.as_view(), name="chatwoot-conversation-status"),
    path("conversations/<int:conversation_id>/priority/", ConversationPriorityView.as_view(), name="chatwoot-conversation-priority"),
    path("conversations/<int:conversation_id>/assign/", ConversationAssignView.as_view(), name="chatwoot-conversation-assign"),
    path("conversations/<int:conversation_id>/labels/", ConversationLabelsView.as_view(), name="chatwoot-conversation-labels"),
    path("conversations/<int:conversation_id>/attributes/", ConversationAttributesView.as_view(), name="chatwoot-conversation-attributes"),
    path("conversations/<int:conversation_id>/mute/", ConversationMuteView.as_view(), name="chatwoot-conversation-mute"),
    path("conversations/<int:conversation_id>/typing/", ConversationTypingView.as_view(), name="chatwoot-conversation-typing"),
    path("conversations/<int:conversation_id>/seen/", ConversationSeenView.as_view(), name="chatwoot-conversation-seen"),
    path("conversations/<int:conversation_id>/link/", ConversationLinkView.as_view(), name="chatwoot-conversation-link"),
    # Ponte com o funil
    path("deals/<uuid:deal_id>/conversations/", DealConversationsView.as_view(), name="chatwoot-deal-conversations"),
    path("customers/<uuid:customer_id>/conversations/", CustomerConversationsView.as_view(), name="chatwoot-customer-conversations"),
    # Contatos
    path("contacts/", ContactListView.as_view(), name="chatwoot-contact-list"),
    path("contacts/<int:contact_id>/", ContactDetailView.as_view(), name="chatwoot-contact-detail"),
    path("contacts/<int:contact_id>/conversations/", ContactConversationsView.as_view(), name="chatwoot-contact-conversations"),
    # Tempo real
    path("events/", EventStreamView.as_view(), name="chatwoot-events"),
    # Entrada pública (chamada pelo Chatwoot)
    path("webhook/<str:secret>/", ChatwootWebhookView.as_view(), name="chatwoot-webhook"),
]
