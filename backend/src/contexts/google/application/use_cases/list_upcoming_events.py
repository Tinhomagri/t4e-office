"""Caso de uso: listar próximos eventos da Agenda."""
from datetime import datetime

from contexts.google.application.use_cases.get_valid_credentials import (
    GetValidCredentials,
)
from contexts.google.domain.entities.meeting import CalendarEvent
from contexts.google.domain.ports.calendar_gateway import CalendarGateway


class ListUpcomingEvents:
    """Retorna os eventos da agenda primária do usuário."""

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
        max_results: int = 10,
        time_min: datetime | None = None,
        time_max: datetime | None = None,
    ) -> list[CalendarEvent]:
        access_token = self.get_valid_credentials.execute(user_id=user_id)
        return self.calendar_gateway.list_upcoming(
            access_token=access_token,
            max_results=max_results,
            time_min=time_min,
            time_max=time_max,
        )
