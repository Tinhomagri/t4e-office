"""Fakes em memória para testar os use cases do contexto google sem DB/rede."""
from datetime import UTC, datetime

from contexts.google.domain.entities.connection import GoogleConnection
from contexts.google.domain.entities.meeting import (
    CreatedMeeting,
    MeetingRef,
)
from contexts.google.domain.ports.calendar_gateway import CalendarGateway
from contexts.google.domain.ports.oauth_provider import (
    OAuthProvider,
    OAuthRevokedError,
    OAuthTokens,
)
from contexts.google.domain.repositories.connection_repository import (
    ConnectionRepository,
)
from contexts.google.domain.repositories.meeting_ref_repository import (
    MeetingRefRepository,
)
from contexts.google.domain.repositories.oauth_state_repository import (
    OAuthStateRepository,
)


class FakeConnectionRepository(ConnectionRepository):
    def __init__(self):
        self._by_user: dict[str, GoogleConnection] = {}

    def get_by_user(self, *, user_id):
        return self._by_user.get(user_id)

    def upsert(self, *, connection):
        connection.id = connection.id or "conn-1"
        self._by_user[connection.user_id] = connection
        return connection

    def delete(self, *, user_id):
        self._by_user.pop(user_id, None)


class FakeStateRepository(OAuthStateRepository):
    def __init__(self):
        self._states: dict[str, str] = {}

    def create(self, *, state, user_id):
        self._states[state] = user_id

    def consume(self, *, state):
        return self._states.pop(state, None)


class FakeMeetingRefRepository(MeetingRefRepository):
    def __init__(self):
        self.saved: list[MeetingRef] = []

    def create(self, *, ref):
        ref.id = "ref-1"
        self.saved.append(ref)
        return ref


class FakeOAuthProvider(OAuthProvider):
    def __init__(self, *, refresh_tokens=None, exchange_tokens=None, revoked=False):
        self.refresh_tokens = refresh_tokens
        self.exchange_tokens = exchange_tokens
        self.revoked = revoked

    def build_authorization_url(self, *, state):
        return f"https://accounts.google.com/o/oauth2/auth?state={state}"

    def exchange_code(self, *, code):
        return self.exchange_tokens or OAuthTokens(
            access_token="acc-new",
            refresh_token="ref-new",
            expiry=datetime(2999, 1, 1, tzinfo=UTC),
            scopes=["calendar.events"],
            email="user@gmail.com",
        )

    def refresh(self, *, refresh_token):
        if self.revoked:
            raise OAuthRevokedError("revogado")
        return self.refresh_tokens or OAuthTokens(
            access_token="acc-refreshed",
            refresh_token=None,
            expiry=datetime(2999, 1, 1, tzinfo=UTC),
            scopes=["calendar.events"],
        )


class FakeCalendarGateway(CalendarGateway):
    def __init__(self, *, busy=None, events=None):
        self.busy = busy or []
        self.events = events or []
        self.create_calls: list[dict] = []

    def create_event(self, **kwargs):
        self.create_calls.append(kwargs)
        return CreatedMeeting(
            event_id="evt-1",
            meet_link="https://meet.google.com/abc-defg-hij",
            html_link="https://calendar.google.com/evt-1",
        )

    def list_upcoming(self, *, access_token, max_results=10, time_min=None, time_max=None):
        return self.events

    def get_busy_intervals(self, *, access_token, time_min, time_max, emails):
        return self.busy


def make_connection(*, expiry: datetime, status_active=True) -> GoogleConnection:
    from contexts.google.domain.entities.connection import ConnectionStatus

    return GoogleConnection(
        user_id="u1",
        google_email="user@gmail.com",
        refresh_token="ref-1",
        access_token="acc-1",
        expiry=expiry,
        scopes=["calendar.events"],
        status=ConnectionStatus.ACTIVE if status_active else ConnectionStatus.REVOKED,
    )
