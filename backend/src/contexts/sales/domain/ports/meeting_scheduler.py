"""Porta de agendamento de reunião (fronteira com o contexto google)."""
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime


class MeetingSchedulerUnavailableError(Exception):
    """O usuário não tem agenda conectada — a atividade é criada sem evento."""


@dataclass
class ScheduledMeeting:
    """Evento de agenda criado para uma reunião comercial."""

    event_id: str
    meet_url: str = ""
    html_link: str = ""


class MeetingScheduler(ABC):
    """Contrato para criar o evento de agenda de uma reunião."""

    @abstractmethod
    def schedule(
        self,
        *,
        user_id: str,
        title: str,
        start: datetime,
        end: datetime,
        attendees: list[str],
        description: str = "",
    ) -> ScheduledMeeting:
        """Cria o evento. Levanta ``MeetingSchedulerUnavailableError`` se não der."""
