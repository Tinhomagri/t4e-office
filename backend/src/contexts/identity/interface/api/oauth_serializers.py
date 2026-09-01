"""Serializers dos endpoints /api/oauth/ — usados pelo fluxo do conector MCP."""
from rest_framework import serializers


class OAuthClientRegisterSerializer(serializers.Serializer):
    """Payload de registro dinâmico de client (RFC 7591)."""

    client_id = serializers.CharField(max_length=64)
    client_name = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")
    redirect_uris = serializers.ListField(child=serializers.CharField())


class OAuthClientSerializer(serializers.Serializer):
    """Representação pública de um client OAuth registrado."""

    client_id = serializers.CharField()
    client_name = serializers.CharField(allow_blank=True)
    redirect_uris = serializers.ListField(child=serializers.CharField())


class OAuthAuthorizeCodeSerializer(serializers.Serializer):
    """Payload pra gerar um código de autorização pro usuário logado."""

    client_id = serializers.CharField(max_length=64)
    redirect_uri = serializers.CharField(max_length=500)


class OAuthTokenExchangeSerializer(serializers.Serializer):
    """Payload de troca de código de autorização por access token."""

    code = serializers.CharField(max_length=128)


class OAuthRevokeByValueSerializer(serializers.Serializer):
    """Payload de revogação de um token pessoal pelo valor bruto."""

    access_token = serializers.CharField()
