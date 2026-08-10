"""Estruturas de domínio para reuniões/eventos da Agenda."""
from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class MeetingRef:
    """Referência leve a um evento do Google (Google é a fonte da verdade)."""

    google_event_id: str
    user_id: str
    card_id: str | None = None
    id: str | None = None


@dataclass
class CreatedMeeting:
    """Resultado da criação de uma reunião na Agenda."""

    event_id: str
    meet_link: str | None
    html_link: str


@dataclass
class CalendarEvent:
    """Visão de um evento da Agenda para exibir no app."""

    event_id: str
    title: str
    start: datetime
    end: datetime
    meet_link: str | None
    html_link: str
    attendees: list[str] = field(default_factory=list)
    all_day: bool = False
    description: str = ""
    # Presente quando o evento é uma ocorrência de uma série recorrente —
    # o app usa isso só para mostrar o selo "recorrente", não edita a série.
    recurring_event_id: str | None = None
    organizer_email: str = ""


@dataclass
class TimeSlot:
    """Janela de horário sugerida (livre)."""

    start: datetime
    end: datetime
