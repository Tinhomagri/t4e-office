"""Serializers das reuniões nativas."""
from rest_framework import serializers


class CreateRoomSerializer(serializers.Serializer):
    """Entrada da criação de sala."""

    workspace_id = serializers.CharField()
    name = serializers.CharField(max_length=120)
    project_id = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    card_id = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    # Audiência da sala. `is_permanent` não entra aqui de propósito — só o
    # hook de criação de squad marca uma sala como fixa.
    visibility = serializers.ChoiceField(
        choices=["restricted", "workspace"], required=False, default="restricted"
    )
    squad_id = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    audience_user_ids = serializers.ListField(
        child=serializers.CharField(), required=False, default=list
    )


class JoinRoomSerializer(serializers.Serializer):
    """Entrada do pedido de token.

    `publish=False` entra como espectador (só recebe mídia) — é o que separa
    a mesa da plateia numa apresentação grande.
    """

    publish = serializers.BooleanField(required=False, default=True)
