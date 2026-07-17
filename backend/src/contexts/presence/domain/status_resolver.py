"""Regra pura de resolução do status de presença efetivo.

Ordem de precedência (decidida no design da Fase 5):
  1. Ausente — se não há atividade recente (movimento) além de AWAY_AFTER.
     A ausência é derivada de atividade real e não pode ser "fingida".
  2. Override manual — se o usuário fixou um status e ele ainda é fresco.
  3. Em reunião — se o Google Agenda indica ocupado agora (busy_until futuro).
  4. Disponível — padrão.

Mantida como função pura (sem ORM/rede) para ser trivialmente testável.
"""
from __future__ import annotations

from datetime import datetime, timedelta

# Status válidos de presença (espelha PresenceStatus no frontend).
VALID_STATUSES = frozenset({"available", "focus", "meeting", "away"})

# Sem movimento por mais que isto → ausente.
AWAY_AFTER = timedelta(minutes=5)

# Override manual expira depois disto (evita ficar "em foco" pra sempre).
MANUAL_TTL = timedelta(hours=8)


def resolve_status(
    *,
    now: datetime,
    last_moved: datetime | None,
    manual_status: str | None,
    manual_status_at: datetime | None,
    busy_until: datetime | None,
) -> str:
    """Retorna o status efetivo ('available' | 'focus' | 'meeting' | 'away')."""
    # 1) Ausência por inatividade tem precedência — sinal de atividade real.
    if last_moved is None or now - last_moved > AWAY_AFTER:
        return "away"

    # 2) Override manual fresco e válido.
    if (
        manual_status in VALID_STATUSES
        and manual_status_at is not None
        and now - manual_status_at < MANUAL_TTL
    ):
        return manual_status

    # 3) Reunião derivada do Google Agenda.
    if busy_until is not None and now < busy_until:
        return "meeting"

    # 4) Padrão.
    return "available"
