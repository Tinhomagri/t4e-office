"""Tempo trabalhado num card: horário comercial + trechos em coluna `is_working`
interrompidos por pausa (função pura, sem banco)."""
from datetime import datetime
from zoneinfo import ZoneInfo

from contexts.projects.domain.working_time import (
    CardEvent,
    business_seconds_between,
    compute_working_time,
)

SP = ZoneInfo("America/Sao_Paulo")
WORKING = {"doing"}


def _at(day: int, hour: int, minute: int = 0) -> datetime:
    # Outubro/2026: dia 12 é segunda, 17 sábado.
    return datetime(2026, 10, day, hour, minute, tzinfo=SP)


def _status(when, old, new):
    return CardEvent(when=when, field="status", old_value=old, new_value=new)


def _paused(when, paused: bool):
    return CardEvent(when=when, field="paused", old_value="", new_value="1" if paused else "")


# ── horário comercial ─────────────────────────────────────────────────────────

def test_horario_comercial_conta_so_dentro_do_expediente():
    assert business_seconds_between(_at(12, 10), _at(12, 12)) == 2 * 3600
    # 07h-20h de segunda: só 09h-18h conta.
    assert business_seconds_between(_at(12, 7), _at(12, 20)) == 9 * 3600


def test_horario_comercial_ignora_noite_e_fim_de_semana():
    # Sexta 17h até segunda 10h: 1h na sexta + 1h na segunda.
    assert business_seconds_between(_at(16, 17), _at(19, 10)) == 2 * 3600


def test_horario_comercial_intervalo_invertido_e_zero():
    assert business_seconds_between(_at(12, 12), _at(12, 10)) == 0


# ── trechos de trabalho ───────────────────────────────────────────────────────

def test_card_criado_em_andamento_sem_historico_conta_desde_a_criacao():
    wt = compute_working_time(
        created_at=_at(12, 9), current_status="doing", events=[], working_slugs=WORKING
    )
    assert wt.worked_seconds == 0
    assert wt.running_since == _at(12, 9)
    assert wt.paused_at is None


def test_card_que_nunca_entrou_em_andamento_nao_tem_tempo():
    wt = compute_working_time(
        created_at=_at(12, 9), current_status="todo", events=[], working_slugs=WORKING
    )
    assert (wt.worked_seconds, wt.running_since, wt.paused_at) == (0, None, None)


def test_pausar_fecha_o_trecho_e_para_de_contar():
    wt = compute_working_time(
        created_at=_at(12, 9),
        current_status="doing",
        events=[_status(_at(12, 10), "todo", "doing"), _paused(_at(12, 12), True)],
        working_slugs=WORKING,
    )
    assert wt.worked_seconds == 2 * 3600
    assert wt.running_since is None
    assert wt.paused_at == _at(12, 12)


def test_retomar_abre_trecho_novo_sem_contar_o_tempo_pausado():
    wt = compute_working_time(
        created_at=_at(12, 9),
        current_status="doing",
        events=[
            _status(_at(12, 10), "todo", "doing"),
            _paused(_at(12, 12), True),
            _paused(_at(12, 15), False),
        ],
        working_slugs=WORKING,
    )
    assert wt.worked_seconds == 2 * 3600
    assert wt.running_since == _at(12, 15)
    assert wt.paused_at is None


def test_sair_da_coluna_acumula_e_voltar_continua_somando():
    wt = compute_working_time(
        created_at=_at(12, 9),
        current_status="doing",
        events=[
            _status(_at(12, 10), "todo", "doing"),
            _status(_at(12, 11), "doing", "review"),
            _status(_at(13, 9), "review", "doing"),
        ],
        working_slugs=WORKING,
    )
    assert wt.worked_seconds == 3600
    assert wt.running_since == _at(13, 9)


def test_mudar_de_coluna_limpa_a_pausa():
    wt = compute_working_time(
        created_at=_at(12, 9),
        current_status="doing",
        events=[
            _status(_at(12, 10), "todo", "doing"),
            _paused(_at(12, 11), True),
            _status(_at(12, 14), "doing", "review"),
            _status(_at(12, 16), "review", "doing"),
        ],
        working_slugs=WORKING,
    )
    assert wt.worked_seconds == 3600
    assert wt.running_since == _at(12, 16)
    assert wt.paused_at is None


def test_card_fora_de_andamento_nao_fica_pausado():
    wt = compute_working_time(
        created_at=_at(12, 9),
        current_status="review",
        events=[
            _status(_at(12, 10), "todo", "doing"),
            _paused(_at(12, 11), True),
            _status(_at(12, 14), "doing", "review"),
        ],
        working_slugs=WORKING,
    )
    assert (wt.worked_seconds, wt.running_since, wt.paused_at) == (3600, None, None)


def test_status_inicial_vem_do_old_value_do_primeiro_evento():
    # Criado já em "doing" e depois movido: o trecho desde a criação conta.
    wt = compute_working_time(
        created_at=_at(12, 9),
        current_status="review",
        events=[_status(_at(12, 11), "doing", "review")],
        working_slugs=WORKING,
    )
    assert wt.worked_seconds == 2 * 3600


# ── trechos fechados com responsável ──────────────────────────────────────────

def _assignee(when, old, new):
    return CardEvent(when=when, field="assignee_id", old_value=old, new_value=new)


def test_trechos_fechados_trazem_responsavel_do_momento():
    wt = compute_working_time(
        created_at=_at(12, 9),
        current_status="doing",
        current_assignee_id="ana",
        events=[
            _status(_at(12, 10), "todo", "doing"),
            _paused(_at(12, 11), True),
            _paused(_at(12, 13), False),
        ],
        working_slugs=WORKING,
    )
    (seg,) = wt.segments
    assert (seg.start, seg.end, seg.seconds, seg.assignee_id) == (
        _at(12, 10), _at(12, 11), 3600, "ana",
    )


def test_troca_de_responsavel_quebra_o_trecho():
    wt = compute_working_time(
        created_at=_at(12, 9),
        current_status="review",
        current_assignee_id="bia",
        events=[
            _status(_at(12, 10), "todo", "doing"),
            _assignee(_at(12, 11), "ana", "bia"),
            _status(_at(12, 13), "doing", "review"),
        ],
        working_slugs=WORKING,
    )
    assert [(s.assignee_id, s.seconds) for s in wt.segments] == [("ana", 3600), ("bia", 7200)]
    assert wt.worked_seconds == 3 * 3600


def test_sem_responsavel_vira_none():
    wt = compute_working_time(
        created_at=_at(12, 9),
        current_status="review",
        events=[_status(_at(12, 10), "todo", "doing"), _status(_at(12, 11), "doing", "review")],
        working_slugs=WORKING,
    )
    assert wt.segments[0].assignee_id is None
