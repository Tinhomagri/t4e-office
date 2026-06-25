"""Serializers do contexto identity — apenas validação de formato/IO."""
from rest_framework import serializers


class RegisterSerializer(serializers.Serializer):
    """Payload de cadastro de usuário."""

    email = serializers.EmailField()
    full_name = serializers.CharField(max_length=200)
    password = serializers.CharField(write_only=True, min_length=8)


class UserSerializer(serializers.Serializer):
    """Representação pública do usuário."""

    id = serializers.CharField()
    email = serializers.EmailField()
    full_name = serializers.CharField()


class CreateWorkspaceSerializer(serializers.Serializer):
    """Payload de criação de workspace."""

    name = serializers.CharField(max_length=120)


class WorkspaceSerializer(serializers.Serializer):
    """Representação pública do workspace."""

    id = serializers.CharField(source="workspace_id")
    name = serializers.CharField()
    slug = serializers.CharField()
