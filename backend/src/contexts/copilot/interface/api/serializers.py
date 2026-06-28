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
