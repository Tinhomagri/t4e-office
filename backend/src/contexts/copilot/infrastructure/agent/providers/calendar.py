"""Ferramentas de agenda: próximos eventos e busca de horário livre.

Liga a reunião ao resto do fluxo — o agente consegue ir de "quando conseguimos
falar com o cliente?" a uma reunião marcada no negócio, sem trocar de tela.

Criar reunião *não* é ação deste domínio: reunião de negócio nasce em
`sales_schedule_activity` (que já cria o evento no Google e guarda o Meet no
negócio). Aqui só lemos a agenda.

Sem Google conectado, as ferramentas devolvem `connected: false` com uma
mensagem — nunca estouram, para a IA saber explicar em vez de travar.
"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta

from contexts.copilot.infrastructure.agent.base import (
    ReadOnlyProvider,
    parse_datetime,
    tool,
)
from contexts.google.application.use_cases.get_valid_credentials import (
    GetValidCredentials,
)
from contexts.google.application.use_cases.list_upcoming_events import (
    ListUpcomingEvents,
)
from contexts.google.application.use_cases.suggest_times import SuggestTimes
from contexts.google.infrastructure.django.calendar_gateway_impl import (
    GoogleCalendarGateway,
)
from contexts.google.infrastructure.django.oauth_provider_impl import (
    GoogleOAuthProvider,
)
from contexts.google.infrastructure.django.repositories_impl import (
    DjangoConnectionRepository,
)
from shared.domain.errors import ValidationError

_NOT_CONNECTED = {
    "connected": False,
    "message": "O usuário não tem a conta Google conectada — a agenda não pode "
    "ser consultada. Sugira conectar em Integrações.",
}


class CalendarProvider(ReadOnlyProvider):
    """Leitura da Agenda Google do usuário que está conversando."""

    domain = "cal"

    def __init__(self, *, workspace_id: str, actor_id: str):
        self.workspace_id = workspace_id
        self.actor_id = actor_id

    def _credentials(self) -> GetValidCredentials:
        return GetValidCredentials(
            oauth_provider=GoogleOAuthProvider(),
            connection_repository=DjangoConnectionRepository(),
        )

    def read_tools(self) -> list[dict]:
        return [
            tool(
                "cal_upcoming_events",
                "Próximos eventos da agenda do usuário (título, início, fim, "
                "participantes, link do Meet). Use para saber a carga de "
                "reuniões da semana ou achar a reunião de onde veio uma "
                "transcrição.",
                {
                    "days_ahead": {
                        "type": "integer",
                        "description": "Janela em dias a partir de agora (padrão 7).",
                    },
                    "max_results": {"type": "integer"},
                },
            ),
            tool(
                "cal_suggest_times",
                "Sugere horários livres na agenda do usuário dentro de uma "
                "janela, em horário comercial. Use antes de propor uma reunião "
                "com cliente para não sugerir horário ocupado.",
                {
                    "time_min": {
                        "type": "string",
                        "description": "Início da janela, ISO (padrão: agora).",
                    },
                    "time_max": {
                        "type": "string",
                        "description": "Fim da janela, ISO (padrão: 7 dias à frente).",
                    },
                    "duration_min": {"type": "integer"},
                    "attendees": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "E-mails a considerar na disponibilidade.",
                    },
                },
            ),
        ]

    def execute_read(self, name: str, args: dict) -> dict:
        handler = getattr(self, f"_read_{name}", None)
        if handler is None:
            raise ValidationError(f"Ferramenta desconhecida: {name}")
        try:
            return handler(args or {})
        except Exception as exc:  # noqa: BLE001 — Google fora do ar não trava o chat
            return {**_NOT_CONNECTED, "detail": str(exc)}

    def _read_cal_upcoming_events(self, args: dict) -> dict:
        days = int(args.get("days_ahead") or 7)
        now = datetime.now(UTC)
        events = ListUpcomingEvents(
            calendar_gateway=GoogleCalendarGateway(),
            get_valid_credentials=self._credentials(),
        ).execute(
            user_id=self.actor_id,
            max_results=int(args.get("max_results") or 10),
            time_min=now,
            time_max=now + timedelta(days=days),
        )
        return {
            "connected": True,
            "events": [
                {
                    "id": e.event_id,
                    "title": e.title,
                    "start": e.start.isoformat() if e.start else None,
                    "end": e.end.isoformat() if e.end else None,
                    "all_day": e.all_day,
                    "attendees": list(e.attendees or []),
                    "meet_link": e.meet_link or "",
                }
                for e in events
            ],
        }

    def _read_cal_suggest_times(self, args: dict) -> dict:
        now = datetime.now(UTC)
        time_min = parse_datetime(args.get("time_min")) or now
        time_max = parse_datetime(args.get("time_max")) or (now + timedelta(days=7))
        slots = SuggestTimes(
            calendar_gateway=GoogleCalendarGateway(),
            get_valid_credentials=self._credentials(),
        ).execute(
            user_id=self.actor_id,
            time_min=time_min,
            time_max=time_max,
            duration_min=int(args.get("duration_min") or 30),
            attendees=args.get("attendees") or [],
        )
        return {
            "connected": True,
            "slots": [
                {"start": s.start.isoformat(), "end": s.end.isoformat()}
                for s in slots
            ],
        }
