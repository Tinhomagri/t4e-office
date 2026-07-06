"""Testes de regras puras do Planning Poker (contexto estimation)."""
from contexts.estimation.domain.entities.poker_session import (
    FIBONACCI,
    PokerSession,
    SessionStatus,
)
from contexts.estimation.interface.api.views import DECK_POINTS, _initials


def test_initials_nome_completo():
    assert _initials("Ana Souza") == "AS"


def test_initials_nome_unico():
    assert _initials("Bruno") == "BR"


def test_initials_vazio():
    assert _initials("") == "??"


def test_deck_points_nao_inclui_interrogacao():
    # "?" é voto de incerteza — não é pontuação final aplicável.
    assert "?" in FIBONACCI
    assert "?" not in {str(p) for p in DECK_POINTS}


def test_deck_points_bate_com_fibonacci_numerico():
    numeric = {int(v) for v in FIBONACCI if v != "?"}
    assert DECK_POINTS == numeric


def test_sessao_nasce_em_waiting():
    s = PokerSession(
        id=None, workspace_id="w", project_id="p", created_by="u", name="Sprint 1"
    )
    assert s.status is SessionStatus.WAITING
    assert s.card_ids == []
