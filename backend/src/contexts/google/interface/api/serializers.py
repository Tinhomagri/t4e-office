"""Serializers do contexto google."""
from rest_framework import serializers


class GoogleStatusSerializer(serializers.Serializer):
    """Status da conexão Google do usuário."""

    connected = serializers.BooleanField()
    status = serializers.CharField(allow_null=True)
    google_email = serializers.EmailField(allow_null=True)


class AuthUrlSerializer(serializers.Serializer):
    """URL de consentimento Google."""

    authorization_url = serializers.URLField()


class CreateMeetingSerializer(serializers.Serializer):
    """Payload p/ agendar reunião."""

    title = serializers.CharField(max_length=300)
    start = serializers.DateTimeField()
    end = serializers.DateTimeField()
    attendees = serializers.ListField(
        child=serializers.EmailField(), allow_empty=True, default=list
    )
    description = serializers.CharField(
        required=False, allow_blank=True, default=""
    )
    card_id = serializers.UUIDField(required=False, allow_null=True)

    def validate(self, attrs):
        if attrs["end"] <= attrs["start"]:
            raise serializers.ValidationError("Fim deve ser após o início.")
        return attrs


class MeetingResultSerializer(serializers.Serializer):
    """Resultado da reunião criada."""

    event_id = serializers.CharField()
    meet_link = serializers.CharField(allow_null=True)
    html_link = serializers.CharField()


class CalendarEventSerializer(serializers.Serializer):
    """Evento da agenda para exibição."""

    event_id = serializers.CharField()
    title = serializers.CharField()
    start = serializers.DateTimeField()
    end = serializers.DateTimeField()
    meet_link = serializers.CharField(allow_null=True)
    html_link = serializers.CharField()
    attendees = serializers.ListField(child=serializers.CharField())
    all_day = serializers.BooleanField()


class TimeSlotSerializer(serializers.Serializer):
    """Janela de horário sugerida."""

    start = serializers.DateTimeField()
    end = serializers.DateTimeField()
