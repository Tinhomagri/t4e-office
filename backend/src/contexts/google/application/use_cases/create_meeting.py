"""Caso de uso: criar reunião na Agenda com Google Meet."""
from datetime import datetime

from contexts.google.application.use_cases.get_valid_credentials import (
    GetValidCredentials,
)
from contexts.google.domain.entities.meeting import CreatedMeeting, MeetingRef
from contexts.google.domain.ports.calendar_gateway import CalendarGateway
from contexts.google.domain.repositories.meeting_ref_repository import (
    MeetingRefRepository,
)


class CreateMeeting:
    """Cria evento + Meet na agenda do usuário e guarda a referência."""

    def __init__(
        self,
        *,
        calendar_gateway: CalendarGateway,
        get_valid_credentials: GetValidCredentials,
        meeting_ref_repository: MeetingRefRepository,
    ):
        self.calendar_gateway = calendar_gateway
        self.get_valid_credentials = get_valid_credentials
        self.meeting_ref_repository = meeting_ref_repository

    def execute(
        self,
        *,
        user_id: str,
        title: str,
        start: datetime,
        end: datetime,
        attendees: list[str],
        description: str = "",
        card_id: str | None = None,
    ) -> CreatedMeeting:
        access_token = self.get_valid_credentials.execute(user_id=user_id)
        created = self.calendar_gateway.create_event(
            access_token=access_token,
            title=title,
            start=start,
            end=end,
            attendees=attendees,
            description=description,
            with_meet=True,
        )
        self.meeting_ref_repository.create(
            ref=MeetingRef(
                google_event_id=created.event_id,
                user_id=user_id,
                card_id=card_id,
            )
        )
        return created
