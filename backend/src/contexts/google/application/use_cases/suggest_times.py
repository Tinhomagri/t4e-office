"""Caso de uso: sugerir horários livres a partir do freebusy."""
from datetime import datetime, timedelta

from contexts.google.application.use_cases.get_valid_credentials import (
    GetValidCredentials,
)
from contexts.google.domain.entities.meeting import TimeSlot
from contexts.google.domain.ports.calendar_gateway import CalendarGateway


class SuggestTimes:
    """Sugere janelas livres de `duration_min` no período, evitando ocupados.

    Considera apenas horário comercial (configurável) e passos de 30min.
    """

    def __init__(
        self,
        *,
        calendar_gateway: CalendarGateway,
        get_valid_credentials: GetValidCredentials,
    ):
        self.calendar_gateway = calendar_gateway
        self.get_valid_credentials = get_valid_credentials

    def execute(
        self,
        *,
        user_id: str,
        time_min: datetime,
        time_max: datetime,
        duration_min: int = 30,
        attendees: list[str] | None = None,
        work_start_hour: int = 8,
        work_end_hour: int = 18,
        max_suggestions: int = 5,
    ) -> list[TimeSlot]:
        access_token = self.get_valid_credentials.execute(user_id=user_id)
        busy = self.calendar_gateway.get_busy_intervals(
            access_token=access_token,
            time_min=time_min,
            time_max=time_max,
            emails=attendees or [],
        )

        duration = timedelta(minutes=duration_min)
        step = timedelta(minutes=30)
        suggestions: list[TimeSlot] = []
        cursor = time_min

        while cursor + duration <= time_max and len(suggestions) < max_suggestions:
            slot_end = cursor + duration
            in_hours = work_start_hour <= cursor.hour and slot_end.hour <= work_end_hour
            if in_hours and not self._overlaps(cursor, slot_end, busy):
                suggestions.append(TimeSlot(start=cursor, end=slot_end))
            cursor += step

        return suggestions

    @staticmethod
    def _overlaps(
        start: datetime,
        end: datetime,
        busy: list[tuple[datetime, datetime]],
    ) -> bool:
        return any(b_start < end and start < b_end for b_start, b_end in busy)
