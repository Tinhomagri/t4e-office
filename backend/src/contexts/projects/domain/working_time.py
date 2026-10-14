"""Tempo trabalhado num card, derivado do histórico.

Um card "conta tempo" enquanto está numa coluna `is_working` e não está
pausado. Pausa e retomada são entradas `paused` no histórico (`"1"` / `""`);
qualquer mudança de status limpa a pausa — sair e voltar pra "Em andamento"
é retomar o trabalho. Tudo derivado do histórico de propósito: o status muda
por vários caminhos (automação, fechamento de sprint, marketing) e um campo
gravado no card ficaria errado no primeiro que esquecesse de atualizá-lo.

Só conta horário comercial (09h-18h, seg-sex, America/Sao_Paulo) — mesma
regra do `businessTime.ts` do front: card parado de madrugada ou no fim de
semana não deve parecer trabalho.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

BUSINESS_TZ = ZoneInfo("America/Sao_Paulo")
BUSINESS_DAY_START = time(9, 0)
BUSINESS_DAY_END = time(18, 0)


@dataclass(frozen=True)
class CardEvent:
    when: datetime
    field: str  # "status" ou "paused"
    old_value: str
    new_value: str


@dataclass(frozen=True)
class Segment:
    """Trecho fechado de trabalho — quem era o responsável enquanto contava."""

    start: datetime
    end: datetime
    seconds: int  # horário comercial
    assignee_id: str | None


@dataclass(frozen=True)
class WorkingTime:
    # Soma dos trechos JÁ FECHADOS; o trecho aberto (desde `running_since`) o
    # front soma ao vivo, pra o contador andar sem recarregar a lista.
    worked_seconds: int
    running_since: datetime | None
    paused_at: datetime | None
    segments: tuple[Segment, ...] = ()


def business_seconds_between(start: datetime, end: datetime) -> int:
    """Segundos de expediente entre duas datas, dia a dia."""
    if end <= start:
        return 0
    start = start.astimezone(BUSINESS_TZ)
    end = end.astimezone(BUSINESS_TZ)
    total = 0.0
    day = start.date()
    while day <= end.date():
        if day.weekday() < 5:
            day_start = datetime.combine(day, BUSINESS_DAY_START, tzinfo=BUSINESS_TZ)
            day_end = datetime.combine(day, BUSINESS_DAY_END, tzinfo=BUSINESS_TZ)
            lo = max(start, day_start)
            hi = min(end, day_end)
            if hi > lo:
                total += (hi - lo).total_seconds()
        day += timedelta(days=1)
    return int(total)


def compute_working_time(
    *,
    created_at: datetime,
    current_status: str,
    events: list[CardEvent],
    working_slugs: set[str],
    current_assignee_id: str | None = None,
) -> WorkingTime:
    """Percorre o histórico (status, pausa, responsável) em ordem e soma os
    trechos ativos. Troca de responsável com o card rodando fecha o trecho de
    um e abre o do outro — cada pessoa fica com as horas dela."""
    events = sorted(events, key=lambda e: e.when)
    first_status = next((e for e in events if e.field == "status"), None)
    status = first_status.old_value if first_status else current_status
    first_assignee = next((e for e in events if e.field == "assignee_id"), None)
    assignee = (first_assignee.old_value if first_assignee else current_assignee_id) or None
    paused_at: datetime | None = None

    def running() -> bool:
        return status in working_slugs and paused_at is None

    segments: list[Segment] = []
    segment_start: datetime | None = created_at if running() else None

    def close(at: datetime) -> None:
        nonlocal segment_start
        if segment_start is not None:
            segments.append(
                Segment(
                    start=segment_start,
                    end=at,
                    seconds=business_seconds_between(segment_start, at),
                    assignee_id=assignee,
                )
            )
        segment_start = None

    for event in events:
        was_running = running()
        if event.field == "status":
            status = event.new_value
            paused_at = None
        elif event.field == "paused":
            paused_at = event.when if event.new_value else None
        elif event.field == "assignee_id":
            if was_running:
                close(event.when)
                segment_start = event.when
            assignee = event.new_value or None
            continue
        else:
            continue
        is_running = running()
        if was_running and not is_running:
            close(event.when)
        elif not was_running and is_running:
            segment_start = event.when

    return WorkingTime(
        worked_seconds=sum(seg.seconds for seg in segments),
        running_since=segment_start if running() else None,
        paused_at=paused_at if status in working_slugs else None,
        segments=tuple(segments),
    )
