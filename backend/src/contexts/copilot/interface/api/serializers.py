"""Serializers do contexto copilot."""
from rest_framework import serializers


class SuggestedTaskSerializer(serializers.Serializer):
    title = serializers.CharField()
    description = serializers.CharField(allow_blank=True)
    priority = serializers.CharField()
    type = serializers.CharField()


class AnalysisSerializer(serializers.Serializer):
    summary = serializers.CharField(allow_blank=True)
    tasks = SuggestedTaskSerializer(many=True)
    decisions = serializers.ListField(child=serializers.CharField())
    risks = serializers.ListField(child=serializers.CharField())


class DocumentSerializer(serializers.Serializer):
    id = serializers.CharField()
    title = serializers.CharField()
    kind = serializers.CharField()
    status = serializers.CharField()
    text_preview = serializers.CharField()
    analysis = AnalysisSerializer(allow_null=True)


class CreateTasksSerializer(serializers.Serializer):
    project_id = serializers.CharField()
    tasks = SuggestedTaskSerializer(many=True)


class AiConfigSerializer(serializers.Serializer):
    """Leitura — nunca inclui a chave em texto puro (só uma dica mascarada)."""

    provider = serializers.CharField()
    model = serializers.CharField(allow_blank=True)
    is_active = serializers.BooleanField()
    configured = serializers.BooleanField()
    key_hint = serializers.CharField(allow_blank=True)
    updated_at = serializers.CharField(allow_null=True)


class ChatMessageSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=["user", "assistant"])
    content = serializers.CharField()


class ChatSerializer(serializers.Serializer):
    workspace_id = serializers.CharField()
    messages = ChatMessageSerializer(many=True)


class AgentExecuteSerializer(serializers.Serializer):
    """Confirmação: executa as ações que a IA propôs no chat."""

    workspace_id = serializers.CharField()
    # Cada ação é um dict livre validado pelo dispatcher (schema conhecido).
    actions = serializers.ListField(child=serializers.DictField(), allow_empty=False)


class AiConfigWriteSerializer(serializers.Serializer):
    """Escrita — api_key é opcional (vazio mantém a chave já salva)."""

    provider = serializers.ChoiceField(choices=["anthropic", "openai"])
    model = serializers.CharField(required=False, allow_blank=True, default="")
    api_key = serializers.CharField(required=False, allow_blank=True, default="")
    is_active = serializers.BooleanField(required=False, default=True)
