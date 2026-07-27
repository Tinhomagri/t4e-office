"""Serializers do contexto chatwoot.

Os de *saída* recebem entidades (dataclasses), não models — por isso são
`Serializer` puros com `source` explícito quando o nome difere. Os de *entrada*
validam o que vem do frontend antes de virar chamada à API do Chatwoot.
"""
from rest_framework import serializers

from contexts.chatwoot.domain.entities.conversation import (
    CONVERSATION_PRIORITIES,
    CONVERSATION_STATUSES,
)


# ── Conexão ──────────────────────────────────────────────────────────────────
class ConnectionSerializer(serializers.Serializer):
    """Estado da conexão. O token nunca sai daqui — só o indicador de que existe."""

    id = serializers.CharField(allow_null=True)
    base_url = serializers.CharField()
    account_id = serializers.IntegerField()
    status = serializers.CharField()
    last_error = serializers.CharField(allow_blank=True)
    last_verified_at = serializers.DateTimeField(allow_null=True)
    agent_name = serializers.CharField(allow_blank=True)
    agent_email = serializers.CharField(allow_blank=True)
    has_token = serializers.SerializerMethodField()
    webhook_url = serializers.SerializerMethodField()

    def get_has_token(self, obj) -> bool:
        return bool(obj.access_token)

    def get_webhook_url(self, obj) -> str:
        """URL para colar em Chatwoot → Configurações → Webhooks."""
        base = self.context.get("public_base_url", "")
        if not base or not obj.webhook_secret:
            return ""
        return f"{base.rstrip('/')}/api/chatwoot/webhook/{obj.webhook_secret}/"


class ConnectSerializer(serializers.Serializer):
    """Entrada do formulário de conexão."""

    workspace_id = serializers.UUIDField()
    base_url = serializers.CharField(max_length=300)
    account_id = serializers.IntegerField(min_value=1)
    # Em branco na edição = manter o token já salvo.
    access_token = serializers.CharField(max_length=500, allow_blank=True, required=False)


# ── Conversas ────────────────────────────────────────────────────────────────
class SenderSerializer(serializers.Serializer):
    id = serializers.IntegerField(allow_null=True)
    name = serializers.CharField(allow_blank=True)
    kind = serializers.CharField(allow_blank=True)
    avatar_url = serializers.CharField(allow_blank=True)
    email = serializers.CharField(allow_blank=True)


class AttachmentSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    file_type = serializers.CharField()
    data_url = serializers.CharField()
    thumb_url = serializers.CharField(allow_blank=True)
    file_size = serializers.IntegerField()


class MessageSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    conversation_id = serializers.IntegerField()
    content = serializers.CharField(allow_blank=True)
    message_type = serializers.IntegerField()
    direction = serializers.CharField()
    content_type = serializers.CharField()
    content_attributes = serializers.DictField()
    private = serializers.BooleanField()
    status = serializers.CharField()
    created_at = serializers.DateTimeField(allow_null=True)
    sender = SenderSerializer(allow_null=True)
    attachments = AttachmentSerializer(many=True)


class ParticipantSerializer(serializers.Serializer):
    id = serializers.IntegerField(allow_null=True)
    name = serializers.CharField(allow_blank=True)
    avatar_url = serializers.CharField(allow_blank=True)
    email = serializers.CharField(allow_blank=True)


class ContactSummarySerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField(allow_blank=True)
    email = serializers.CharField(allow_blank=True)
    phone_number = serializers.CharField(allow_blank=True)
    identifier = serializers.CharField(allow_blank=True)
    avatar_url = serializers.CharField(allow_blank=True)
    additional_attributes = serializers.DictField()
    custom_attributes = serializers.DictField()


class ConversationSerializer(serializers.Serializer):
    """Conversa + o vínculo comercial injetado pelo caso de uso."""

    id = serializers.IntegerField()
    uuid = serializers.CharField(allow_blank=True)
    inbox_id = serializers.IntegerField()
    status = serializers.CharField()
    priority = serializers.CharField(allow_null=True)
    labels = serializers.ListField(child=serializers.CharField())
    custom_attributes = serializers.DictField()
    additional_attributes = serializers.DictField()
    unread_count = serializers.IntegerField()
    can_reply = serializers.BooleanField()
    muted = serializers.BooleanField()
    snoozed_until = serializers.DateTimeField(allow_null=True)
    created_at = serializers.DateTimeField(allow_null=True)
    last_activity_at = serializers.DateTimeField(allow_null=True)
    waiting_since = serializers.DateTimeField(allow_null=True)
    channel = serializers.CharField(allow_blank=True)
    contact = ContactSummarySerializer(allow_null=True)
    assignee = ParticipantSerializer(allow_null=True)
    team = ParticipantSerializer(allow_null=True)
    last_message = MessageSerializer(allow_null=True)
    messages = MessageSerializer(many=True)
    link = serializers.SerializerMethodField()

    def get_link(self, obj) -> dict:
        """Negócio/cliente vinculado — vem do `link_map` no contexto."""
        link_map = self.context.get("link_map") or {}
        return link_map.get(obj.id, {})


class ConversationPageSerializer(serializers.Serializer):
    payload = ConversationSerializer(many=True, source="conversations")
    mine_count = serializers.IntegerField()
    unassigned_count = serializers.IntegerField()
    assigned_count = serializers.IntegerField()
    all_count = serializers.IntegerField()


# ── Catálogos ────────────────────────────────────────────────────────────────
class InboxSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    channel_type = serializers.CharField(allow_blank=True)
    channel_label = serializers.CharField()
    medium = serializers.CharField(allow_blank=True)
    provider = serializers.CharField(allow_blank=True)
    avatar_url = serializers.CharField(allow_blank=True)
    website_url = serializers.CharField(allow_blank=True)
    phone_number = serializers.CharField(allow_blank=True)
    enable_auto_assignment = serializers.BooleanField()
    working_hours_enabled = serializers.BooleanField()
    timezone = serializers.CharField(allow_blank=True)
    csat_survey_enabled = serializers.BooleanField()


class AgentSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField(allow_blank=True)
    email = serializers.CharField(allow_blank=True)
    role = serializers.CharField()
    avatar_url = serializers.CharField(allow_blank=True)
    availability_status = serializers.CharField()


class TeamSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    description = serializers.CharField(allow_blank=True)
    allow_auto_assign = serializers.BooleanField()


class LabelSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    title = serializers.CharField()
    description = serializers.CharField(allow_blank=True)
    color = serializers.CharField()
    show_on_sidebar = serializers.BooleanField()


class CannedResponseSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    short_code = serializers.CharField()
    content = serializers.CharField()


class CatalogSerializer(serializers.Serializer):
    """Resposta do endpoint que monta a tela inteira de uma vez."""

    inboxes = InboxSerializer(many=True)
    agents = AgentSerializer(many=True)
    teams = TeamSerializer(many=True)
    labels = LabelSerializer(many=True)
    canned_responses = CannedResponseSerializer(many=True)


class ChatContactSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField(allow_blank=True)
    email = serializers.CharField(allow_blank=True)
    phone_number = serializers.CharField(allow_blank=True)
    identifier = serializers.CharField(allow_blank=True)
    avatar_url = serializers.CharField(allow_blank=True)
    blocked = serializers.BooleanField()
    availability_status = serializers.CharField()
    additional_attributes = serializers.DictField()
    custom_attributes = serializers.DictField()
    city = serializers.CharField(allow_blank=True)
    country = serializers.CharField(allow_blank=True)
    company_name = serializers.CharField(allow_blank=True)
    last_activity_at = serializers.DateTimeField(allow_null=True)
    created_at = serializers.DateTimeField(allow_null=True)


# ── Entradas de ação ─────────────────────────────────────────────────────────
class SendMessageSerializer(serializers.Serializer):
    content = serializers.CharField(allow_blank=True, trim_whitespace=False)
    private = serializers.BooleanField(default=False)
    content_type = serializers.CharField(default="text", required=False)
    content_attributes = serializers.DictField(required=False)
    template_params = serializers.DictField(required=False)


class ChangeStatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=CONVERSATION_STATUSES)
    snoozed_until = serializers.CharField(required=False, allow_blank=True)


class ChangePrioritySerializer(serializers.Serializer):
    # `allow_null` porque limpar a prioridade é uma operação legítima.
    priority = serializers.ChoiceField(
        choices=CONVERSATION_PRIORITIES, allow_null=True, required=False
    )


class AssignSerializer(serializers.Serializer):
    assignee_id = serializers.IntegerField(required=False, allow_null=True)
    team_id = serializers.IntegerField(required=False, allow_null=True)


class LabelsSerializer(serializers.Serializer):
    labels = serializers.ListField(child=serializers.CharField(), allow_empty=True)


class AttributesSerializer(serializers.Serializer):
    custom_attributes = serializers.DictField()


class LinkDealSerializer(serializers.Serializer):
    deal_id = serializers.UUIDField(required=False, allow_null=True)
    customer_id = serializers.UUIDField(required=False, allow_null=True)


class FilterSerializer(serializers.Serializer):
    payload = serializers.ListField(child=serializers.DictField())


class WebhookEventSerializer(serializers.Serializer):
    id = serializers.CharField()
    event = serializers.CharField()
    conversation_id = serializers.IntegerField(allow_null=True)
    contact_id = serializers.IntegerField(allow_null=True)
    created_at = serializers.DateTimeField()
