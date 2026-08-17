"""Testes de criação de reunião e sugestão de horários."""
from datetime import UTC, datetime, timedelta

from contexts.google.application.use_cases.create_meeting import CreateMeeting
from contexts.google.application.use_cases.get_valid_credentials import (
    GetValidCredentials,
)
from contexts.google.application.use_cases.list_upcoming_events import (
    ListUpcomingEvents,
)
from contexts.google.application.use_cases.suggest_times import SuggestTimes
from contexts.google.domain.entities.meeting import CalendarEvent

from .fakes import (
    FakeCalendarGateway,
    FakeConnectionRepository,
    FakeMeetingRefRepository,
    FakeOAuthProvider,
    make_connection,
)


def _creds(conns) -> GetValidCredentials:
    return GetValidCredentials(
        oauth_provider=FakeOAuthProvider(), connection_repository=conns
    )


def _connected_repo() -> FakeConnectionRepository:
    conns = FakeConnectionRepository()
    future = datetime.now(UTC) + timedelta(hours=1)
    conns.upsert(connection=make_connection(expiry=future))
    return conns


def test_cria_reuniao_com_meet_e_salva_ref():
    conns = _connected_repo()
    gateway = FakeCalendarGateway()
    refs = FakeMeetingRefRepository()
    start = datetime(2026, 7, 1, 10, 0, tzinfo=UTC)
    result = CreateMeeting(
        calendar_gateway=gateway,
        get_valid_credentials=_creds(conns),
        meeting_ref_repository=refs,
    ).execute(
        user_id="u1",
        title="Review",
        start=start,
        end=start + timedelta(minutes=30),
        attendees=["a@x.com"],
    )
    assert result.meet_link
    # pediu Meet no payload
    assert gateway.create_calls[0]["with_meet"] is True
    # guardou referência
    assert refs.saved[0].google_event_id == "evt-1"


def test_reuniao_vinculada_a_projeto_guarda_project_id_titulo_e_fim():
    """Sem isto o polling de transcrição não sabe em qual projeto salvar o
    Documento nem qual o nome do evento pra procurar no Drive."""
    conns = _connected_repo()
    refs = FakeMeetingRefRepository()
    start = datetime(2026, 7, 1, 10, 0, tzinfo=UTC)
    end = start + timedelta(minutes=30)
    CreateMeeting(
        calendar_gateway=FakeCalendarGateway(),
        get_valid_credentials=_creds(conns),
        meeting_ref_repository=refs,
    ).execute(
        user_id="u1",
        title="Reunião com cliente",
        start=start,
        end=end,
        attendees=["a@x.com"],
        project_id="proj-1",
    )
    saved = refs.saved[0]
    assert saved.project_id == "proj-1"
    assert saved.title == "Reunião com cliente"
    assert saved.meeting_end == end


def test_lista_eventos_proximos():
    conns = _connected_repo()
    evt = CalendarEvent(
        event_id="e1",
        title="Daily",
        start=datetime(2026, 7, 1, 9, tzinfo=UTC),
        end=datetime(2026, 7, 1, 9, 15, tzinfo=UTC),
        meet_link=None,
        html_link="x",
    )
    events = ListUpcomingEvents(
        calendar_gateway=FakeCalendarGateway(events=[evt]),
        get_valid_credentials=_creds(conns),
    ).execute(user_id="u1")
    assert events[0].title == "Daily"


def test_sugere_horarios_evitando_ocupados():
    conns = _connected_repo()
    # janela: 2026-07-01 08:00 → 12:00; ocupado 08:00-10:00
    time_min = datetime(2026, 7, 1, 8, 0, tzinfo=UTC)
    time_max = datetime(2026, 7, 1, 12, 0, tzinfo=UTC)
    busy = [(time_min, datetime(2026, 7, 1, 10, 0, tzinfo=UTC))]
    slots = SuggestTimes(
        calendar_gateway=FakeCalendarGateway(busy=busy),
        get_valid_credentials=_creds(conns),
    ).execute(
        user_id="u1",
        time_min=time_min,
        time_max=time_max,
        duration_min=30,
    )
    assert slots, "deveria sugerir ao menos um horário livre"
    # primeiro slug livre começa às 10:00 (após o ocupado)
    assert slots[0].start.hour == 10
    # nenhum slot colide com o ocupado
    for s in slots:
        assert s.start >= datetime(2026, 7, 1, 10, 0, tzinfo=UTC)
