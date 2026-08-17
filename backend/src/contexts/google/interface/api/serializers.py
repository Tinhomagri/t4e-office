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
    # Projeto vinculado — quando presente, a transcrição da reunião vira
    # Documento dele assim que o Meet a soltar no Drive (ver management
    # command `check_meeting_transcripts`).
    project_id = serializers.UUIDField(required=False, allow_null=True)
    # Linha(s) RRULE cruas (RFC 5545) — o frontend monta a regra a partir da
    # UI de recorrência, o backend só repassa pro Google.
    recurrence = serializers.ListField(
        child=serializers.CharField(), required=False, allow_null=True, default=None
    )

    def validate(self, attrs):
        if attrs["end"] <= attrs["start"]:
            raise serializers.ValidationError("Fim deve ser após o início.")
        return attrs


class UpdateMeetingSerializer(serializers.Serializer):
    """Payload p/ editar reunião — todo campo é opcional (patch parcial)."""

    title = serializers.CharField(max_length=300, required=False)
    start = serializers.DateTimeField(required=False)
    end = serializers.DateTimeField(required=False)
    attendees = serializers.ListField(
        child=serializers.EmailField(), required=False
    )
    description = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        start = attrs.get("start")
        end = attrs.get("end")
        if start and end and end <= start:
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
    description = serializers.CharField(allow_blank=True)
    recurring_event_id = serializers.CharField(allow_null=True)
    organizer_email = serializers.CharField(allow_blank=True)


class TimeSlotSerializer(serializers.Serializer):
    """Janela de horário sugerida."""

    start = serializers.DateTimeField()
    end = serializers.DateTimeField()


class AttendeeStatSerializer(serializers.Serializer):
    email = serializers.CharField()
    meetings = serializers.IntegerField()
    minutes = serializers.IntegerField()


class MeetingParticipationReportSerializer(serializers.Serializer):
    total_meetings = serializers.IntegerField()
    total_minutes = serializers.IntegerField()
    average_minutes = serializers.FloatField()
    busiest_weekday = serializers.CharField(allow_null=True)
    top_attendees = AttendeeStatSerializer(many=True)


# ── Google Chat ──────────────────────────────────────────────────────────────

class ChatMemberSerializer(serializers.Serializer):
    member_id = serializers.CharField()
    display_name = serializers.CharField()
    avatar_url = serializers.CharField(allow_blank=True)


class ChatSpaceSerializer(serializers.Serializer):
    space_id = serializers.CharField()
    display_name = serializers.CharField()
    is_group = serializers.BooleanField()
    members = ChatMemberSerializer(many=True)
    last_message_preview = serializers.CharField(allow_blank=True)
    last_message_at = serializers.DateTimeField(allow_null=True)


class ChatMessageSerializer(serializers.Serializer):
    message_id = serializers.CharField()
    space_id = serializers.CharField()
    sender_id = serializers.CharField()
    sender_name = serializers.CharField()
    sender_avatar_url = serializers.CharField(allow_blank=True)
    text = serializers.CharField()
    created_at = serializers.DateTimeField()
    is_own = serializers.BooleanField()


class SendChatMessageSerializer(serializers.Serializer):
    text = serializers.CharField(max_length=4000, allow_blank=False)


class CreateChatDmSerializer(serializers.Serializer):
    member_email = serializers.EmailField()
