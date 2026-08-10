"""Caso de uso: cancelar uma reunião existente na Agenda."""
from contexts.google.application.use_cases.get_valid_credentials import (
    GetValidCredentials,
)
from contexts.google.domain.ports.calendar_gateway import CalendarGateway


class CancelMeeting:
    """Remove o evento da agenda primária e avisa os convidados."""

    def __init__(
        self,
        *,
        calendar_gateway: CalendarGateway,
        get_valid_credentials: GetValidCredentials,
    ):
        self.calendar_gateway = calendar_gateway
        self.get_valid_credentials = get_valid_credentials

    def execute(self, *, user_id: str, event_id: str) -> None:
        access_token = self.get_valid_credentials.execute(user_id=user_id)
        self.calendar_gateway.delete_event(access_token=access_token, event_id=event_id)
