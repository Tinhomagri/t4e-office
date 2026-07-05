"""Views finas do contexto google — orquestram casos de uso."""
import logging
from datetime import UTC, datetime, timedelta

from django.conf import settings
from django.shortcuts import redirect
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from contexts.google.application.use_cases.create_meeting import CreateMeeting
from contexts.google.application.use_cases.disconnect_google import DisconnectGoogle
from contexts.google.application.use_cases.get_authorization_url import (
    GetAuthorizationUrl,
)
from contexts.google.application.use_cases.get_valid_credentials import (
    GetValidCredentials,
)
from contexts.google.application.use_cases.handle_oauth_callback import (
    HandleOAuthCallback,
)
from contexts.google.application.use_cases.list_upcoming_events import (
    ListUpcomingEvents,
)
from contexts.google.application.use_cases.suggest_times import SuggestTimes
from contexts.google.domain.ports.calendar_gateway import CalendarError
from contexts.google.infrastructure.django.calendar_gateway_impl import (
    GoogleCalendarGateway,
)
from contexts.google.infrastructure.django.oauth_provider_impl import (
    GoogleOAuthProvider,
)
from contexts.google.infrastructure.django.repositories_impl import (
    DjangoConnectionRepository,
    DjangoMeetingRefRepository,
    DjangoOAuthStateRepository,
)
from contexts.google.interface.api.serializers import (
    AuthUrlSerializer,
    CalendarEventSerializer,
    CreateMeetingSerializer,
    GoogleStatusSerializer,
    MeetingResultSerializer,
    TimeSlotSerializer,
)


def _credentials_use_case() -> GetValidCredentials:
    return GetValidCredentials(
        oauth_provider=GoogleOAuthProvider(),
        connection_repository=DjangoConnectionRepository(),
    )


class GoogleAuthUrlView(APIView):
    """Gera a URL de consentimento Google."""

    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        url = GetAuthorizationUrl(
            oauth_provider=GoogleOAuthProvider(),
            state_repository=DjangoOAuthStateRepository(),
        ).execute(user_id=str(request.user.id))
        return Response(AuthUrlSerializer({"authorization_url": url}).data)


class GoogleCallbackView(APIView):
    """Callback OAuth — redireciona o usuário de volta ao frontend."""

    permission_classes = [AllowAny]

    def get(self, request: Request) -> Response:
        front = settings.FRONTEND_URL
        error = request.query_params.get("error")
        if error:
            return redirect(f"{front}/app/integrations?google=denied")

        code = request.query_params.get("code", "")
        state = request.query_params.get("state", "")
        try:
            HandleOAuthCallback(
                oauth_provider=GoogleOAuthProvider(),
                connection_repository=DjangoConnectionRepository(),
                state_repository=DjangoOAuthStateRepository(),
            ).execute(code=code, state=state)
        except Exception:
            logging.getLogger(__name__).exception("Falha no callback OAuth do Google")
            return redirect(f"{front}/app/integrations?google=error")
        return redirect(f"{front}/app/integrations?google=connected")


class GoogleStatusView(APIView):
    """Indica se o usuário tem conexão Google ativa."""

    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        conn = DjangoConnectionRepository().get_by_user(user_id=str(request.user.id))
        data = GoogleStatusSerializer(
            {
                "connected": bool(conn and conn.status.value == "active"),
                "status": conn.status.value if conn else None,
                "google_email": conn.google_email if conn else None,
            }
        ).data
        return Response(data)


class GoogleDisconnectView(APIView):
    """Desvincula a conta Google do usuário."""

    permission_classes = [IsAuthenticated]

    def post(self, request: Request) -> Response:
        DisconnectGoogle(
            connection_repository=DjangoConnectionRepository()
        ).execute(user_id=str(request.user.id))
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeetingCreateView(APIView):
    """Cria uma reunião na Agenda com Google Meet."""

    permission_classes = [IsAuthenticated]

    def post(self, request: Request) -> Response:
        serializer = CreateMeetingSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            result = CreateMeeting(
                calendar_gateway=GoogleCalendarGateway(),
                get_valid_credentials=_credentials_use_case(),
                meeting_ref_repository=DjangoMeetingRefRepository(),
            ).execute(
                user_id=str(request.user.id),
                title=data["title"],
                start=data["start"],
                end=data["end"],
                attendees=data["attendees"],
                description=data.get("description", ""),
                card_id=str(data["card_id"]) if data.get("card_id") else None,
            )
        except CalendarError:
            return Response(
                {"error": "Falha ao falar com o Google Agenda. Tente novamente."},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        return Response(
            MeetingResultSerializer(result).data, status=status.HTTP_201_CREATED
        )


class UpcomingEventsView(APIView):
    """Lista próximos eventos da Agenda."""

    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        try:
            events = ListUpcomingEvents(
                calendar_gateway=GoogleCalendarGateway(),
                get_valid_credentials=_credentials_use_case(),
            ).execute(user_id=str(request.user.id), max_results=10)
        except CalendarError:
            return Response(
                {"error": "Falha ao falar com o Google Agenda. Tente novamente."},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        return Response(CalendarEventSerializer(events, many=True).data)


class AvailabilityView(APIView):
    """Sugere horários livres no período informado."""

    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        now = datetime.now(UTC)
        days = int(request.query_params.get("days", 7))
        duration = int(request.query_params.get("duration_min", 30))
        attendees = [
            e for e in request.query_params.get("attendees", "").split(",") if e
        ]
        try:
            slots = SuggestTimes(
                calendar_gateway=GoogleCalendarGateway(),
                get_valid_credentials=_credentials_use_case(),
            ).execute(
                user_id=str(request.user.id),
                time_min=now,
                time_max=now + timedelta(days=days),
                duration_min=duration,
                attendees=attendees,
            )
        except CalendarError:
            return Response(
                {"error": "Falha ao falar com o Google Agenda. Tente novamente."},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        return Response(TimeSlotSerializer(slots, many=True).data)
