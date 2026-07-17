"""Testes da regra pura de status de presença."""
from datetime import UTC, datetime, timedelta

from contexts.presence.domain.status_resolver import resolve_status

NOW = datetime(2026, 7, 11, 12, 0, tzinfo=UTC)


def _resolve(**over):
    base = dict(
        now=NOW,
        last_moved=NOW,  # ativo agora
        manual_status=None,
        manual_status_at=None,
        busy_until=None,
    )
    base.update(over)
    return resolve_status(**base)


def test_default_available():
    assert _resolve() == "available"


def test_away_quando_inativo():
    assert _resolve(last_moved=NOW - timedelta(minutes=6)) == "away"


def test_away_quando_sem_movimento_registrado():
    assert _resolve(last_moved=None) == "away"


def test_ausencia_tem_precedencia_sobre_manual():
    # Mesmo com override manual, inatividade vence.
    assert (
        _resolve(
            last_moved=NOW - timedelta(minutes=10),
            manual_status="focus",
            manual_status_at=NOW,
        )
        == "away"
    )


def test_override_manual_fresco():
    assert _resolve(manual_status="focus", manual_status_at=NOW) == "focus"


def test_override_manual_expirado_ignorado():
    assert (
        _resolve(manual_status="focus", manual_status_at=NOW - timedelta(hours=9))
        == "available"
    )


def test_manual_invalido_ignorado():
    assert _resolve(manual_status="banana", manual_status_at=NOW) == "available"


def test_meeting_quando_ocupado_agora():
    assert _resolve(busy_until=NOW + timedelta(minutes=10)) == "meeting"


def test_meeting_passado_ignorado():
    assert _resolve(busy_until=NOW - timedelta(minutes=1)) == "available"


def test_manual_vence_meeting():
    assert (
        _resolve(
            manual_status="available",
            manual_status_at=NOW,
            busy_until=NOW + timedelta(minutes=10),
        )
        == "available"
    )
