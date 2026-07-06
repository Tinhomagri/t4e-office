"""Porta de saída: acesso à Google Calendar API."""
from abc import ABC, abstractmethod
from datetime import datetime

from contexts.google.domain.entities.meeting import CalendarEvent, CreatedMeeting


class CalendarError(Exception):
    """Falha ao falar com a Calendar API (5xx, rate limit, etc.)."""


class CalendarGateway(ABC):
    """Contrato de operações na Agenda do usuário."""

    @abstractmethod
    def create_event(
        self,
        *,
        access_token: str,
        title: str,
        start: datetime,
        end: datetime,
        attendees: list[str],
        description: str = "",
        with_meet: bool = True,
    ) -> CreatedMeeting:
        """Cria evento na agenda primária, com Google Meet e convidados."""

    @abstractmethod
    def list_upcoming(
        self,
        *,
        access_token: str,
        max_results: int = 10,
        time_min: datetime | None = None,
        time_max: datetime | None = None,
    ) -> list[CalendarEvent]:
        """Lista eventos da agenda primária no período [time_min, time_max].

        Sem período informado, lista os próximos `max_results` a partir de agora.
        """

    @abstractmethod
    def get_busy_intervals(
        self,
        *,
        access_token: str,
        time_min: datetime,
        time_max: datetime,
        emails: list[str],
    ) -> list[tuple[datetime, datetime]]:
        """Retorna intervalos ocupados (freebusy) no período para os emails."""
