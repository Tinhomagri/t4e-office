"""Caso de uso: relatório de participação/tempo em reunião num período."""
from dataclasses import dataclass, field
from datetime import datetime

from contexts.google.application.use_cases.get_valid_credentials import (
    GetValidCredentials,
)
from contexts.google.domain.ports.calendar_gateway import CalendarGateway


@dataclass
class AttendeeStat:
    email: str
    meetings: int
    minutes: int


@dataclass
class MeetingParticipationReport:
    """Métricas agregadas de reuniões no período — só eventos com Meet contam
    como "reunião" (evento sem Meet costuma ser bloqueio de agenda, não call)."""

    total_meetings: int
    total_minutes: int
    average_minutes: float
    busiest_weekday: str | None
    top_attendees: list[AttendeeStat] = field(default_factory=list)


_WEEKDAY_PT = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"]


class BuildMeetingParticipationReport:
    """Busca eventos passados com Meet no período e agrega por participante."""

    def __init__(
        self,
        *,
        calendar_gateway: CalendarGateway,
        get_valid_credentials: GetValidCredentials,
    ):
        self.calendar_gateway = calendar_gateway
        self.get_valid_credentials = get_valid_credentials

    def execute(
        self, *, user_id: str, time_min: datetime, time_max: datetime
    ) -> MeetingParticipationReport:
        access_token = self.get_valid_credentials.execute(user_id=user_id)
        events = self.calendar_gateway.list_upcoming(
            access_token=access_token, time_min=time_min, time_max=time_max
        )
        meetings = [e for e in events if e.meet_link and not e.all_day]

        total_minutes = 0
        weekday_minutes = [0] * 7
        by_attendee: dict[str, list[int]] = {}
        for e in meetings:
            minutes = max(1, round((e.end - e.start).total_seconds() / 60))
            total_minutes += minutes
            weekday_minutes[e.start.weekday()] += minutes
            for email in e.attendees:
                stat = by_attendee.setdefault(email, [0, 0])
                stat[0] += 1
                stat[1] += minutes

        top_attendees = sorted(
            (
                AttendeeStat(email=email, meetings=count, minutes=minutes)
                for email, (count, minutes) in by_attendee.items()
            ),
            key=lambda s: s.minutes,
            reverse=True,
        )[:10]

        busiest_idx = max(range(7), key=lambda i: weekday_minutes[i]) if total_minutes else None

        return MeetingParticipationReport(
            total_meetings=len(meetings),
            total_minutes=total_minutes,
            average_minutes=round(total_minutes / len(meetings), 1) if meetings else 0.0,
            busiest_weekday=_WEEKDAY_PT[busiest_idx] if busiest_idx is not None else None,
            top_attendees=top_attendees,
        )
