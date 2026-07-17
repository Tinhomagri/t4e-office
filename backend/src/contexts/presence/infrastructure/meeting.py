"""Detecção best-effort de 'em reunião' via Google Agenda.

Chamada no heartbeat, com throttle: só consulta o Google se o último check
tem mais de MEETING_CHECK_TTL. Qualquer falha (sem conexão, erro de rede)
é engolida — presença nunca deve quebrar por causa da agenda.
"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta

MEETING_CHECK_TTL = timedelta(minutes=2)


def refresh_busy_until(presence, *, now: datetime | None = None) -> None:
    """Atualiza presence.busy_until (in-place) se o cache estiver velho.

    Não salva — o chamador persiste a `presence` depois.
    """
    now = now or datetime.now(UTC)
    if (
        presence.meeting_checked_at is not None
        and now - presence.meeting_checked_at < MEETING_CHECK_TTL
    ):
        return

    presence.meeting_checked_at = now
    presence.busy_until = None

    try:
        # Imports tardios: evita acoplar o contexto de presença ao Google no
        # import-time (e mantém o módulo carregável sem as deps do Google).
        from contexts.google.application.use_cases.get_valid_credentials import (
            GetValidCredentials,
        )
        from contexts.google.infrastructure.django.calendar_gateway_impl import (
            GoogleCalendarGateway,
        )
        from contexts.google.infrastructure.django.oauth_provider_impl import (
            GoogleOAuthProvider,
        )
        from contexts.google.infrastructure.django.repositories_impl import (
            DjangoConnectionRepository,
        )

        token = GetValidCredentials(
            oauth_provider=GoogleOAuthProvider(),
            connection_repository=DjangoConnectionRepository(),
        ).execute(user_id=str(presence.user_id))

        busy = GoogleCalendarGateway().get_busy_intervals(
            access_token=token,
            time_min=now,
            time_max=now + timedelta(minutes=5),
            emails=[],
        )
        for start, end in busy:
            if start <= now <= end:
                presence.busy_until = end
                break
    except Exception:
        # Sem Google conectado ou falha — segue sem reunião.
        presence.busy_until = None
