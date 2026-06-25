"""Serializers do contexto projects."""
from rest_framework import serializers


class CreateProjectSerializer(serializers.Serializer):
    """Payload de criação de projeto."""

    workspace_id = serializers.CharField()
    name = serializers.CharField(max_length=120)
    key = serializers.CharField(max_length=10, min_length=2)


class ProjectSerializer(serializers.Serializer):
    """Representação pública do projeto."""

    id = serializers.CharField()
    name = serializers.CharField()
    key = serializers.CharField()
    workspace_id = serializers.CharField()
