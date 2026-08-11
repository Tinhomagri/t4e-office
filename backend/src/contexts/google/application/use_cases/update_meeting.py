"""Caso de uso: editar uma reunião existente na Agenda."""
from datetime import datetime

from contexts.google.application.use_cases.get_valid_credentials import (
    GetValidCredentials,
)
from contexts.google.domain.entities.meeting import CreatedMeeting
from contexts.google.domain.ports.calendar_gateway import CalendarGateway


class UpdateMeeting:
    """Atualiza campos informados de um evento; o resto permanece intocado."""

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
        event_id: str,
        title: str | None = None,
        start: datetime | None = None,
        end: datetime | None = None,
        attendees: list[str] | None = None,
        description: str | None = None,
    ) -> CreatedMeeting:
        access_token = self.get_valid_credentials.execute(user_id=user_id)
        return self.calendar_gateway.update_event(
            access_token=access_token,
            event_id=event_id,
            title=title,
            start=start,
            end=end,
            attendees=attendees,
            description=description,
        )
