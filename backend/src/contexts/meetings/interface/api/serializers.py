"""Serializers das reuniões nativas."""
from rest_framework import serializers


class CreateRoomSerializer(serializers.Serializer):
    """Entrada da criação de sala."""

    workspace_id = serializers.CharField()
    name = serializers.CharField(max_length=120)
    project_id = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    card_id = serializers.CharField(required=False, allow_blank=True, allow_null=True)


class JoinRoomSerializer(serializers.Serializer):
    """Entrada do pedido de token.

    `publish=False` entra como espectador (só recebe mídia) — é o que separa
    a mesa da plateia numa apresentação grande.
    """

    publish = serializers.BooleanField(required=False, default=True)
