"""Iniciar e concluir sprint no padrão do Jira — único caminho para mudar o
status de uma sprint (views e Copiloto chamam daqui; o PATCH só edita nome,
meta e datas).

- Iniciar: nome, datas, meta e duração opcionais; fim não pode ser antes do
  início; sem fim, a janela sai da duração da sprint (padrão 2 semanas),
  contando o dia de início. Uma sprint ativa por projeto.
- Concluir: "concluído" é pela categoria da coluna (`done`), não pelo slug.
  Abertos vão para o backlog, para uma sprint futura ou para uma sprint nova;
  mantêm o status (como no Jira) e cada saída vira histórico do card.
"""
from __future__ import annotations

import re
from datetime import date, timedelta

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from contexts.projects.domain.entities.sprint import DEFAULT_SPRINT_DAYS
from contexts.projects.infrastructure.django.models import (
    CardHistoryModel,
    SprintModel,
    WorkflowStatusModel,
)
from contexts.projects.interface.api import capabilities as caps
from contexts.projects.interface.api.permissions import assert_project_capability
from shared.domain.errors import NotFoundError, ValidationError

# "Campo não enviado" ≠ None (None em `duration_days` = personalizada).
UNSET = object()


def window_end(start: date, duration_days: int | None) -> date:
    """Último dia da sprint: o dia de início conta — 14 dias a partir de uma
    segunda terminam no domingo seguinte (mesma regra de `Sprint.window_from`)."""
    return start + timedelta(days=(duration_days or DEFAULT_SPRINT_DAYS) - 1)


def _get_sprint(sprint_id: str, actor_id: str) -> SprintModel:
    sprint = SprintModel.objects.filter(id=sprint_id).select_related("project").first()
    if sprint is None:
        raise NotFoundError("Sprint não encontrada.")
    assert_project_capability(
        project_id=str(sprint.project_id), user_id=str(actor_id), capability=caps.MANAGE_SPRINTS
    )
    return sprint


def parse_date(value, field: str) -> date | None:
    if value in (None, ""):
        return None
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value))
    except ValueError as exc:
        raise ValidationError(f"Data inválida em {field}. Use AAAA-MM-DD.") from exc


def assert_date_order(start: date | None, end: date | None) -> None:
    if start and end and end < start:
        raise ValidationError("A data de fim não pode ser anterior à de início.")


def done_slugs(project_id) -> set[str]:
    """Colunas que contam como concluído no board (categoria `done` ou flag
    `is_done`). Board sem workflow configurado cai no slug legado `done`."""
    slugs = set(
        WorkflowStatusModel.objects.filter(project_id=project_id)
        .filter(Q(category="done") | Q(is_done=True))
        .values_list("slug", flat=True)
    )
    return slugs or {"done"}


def next_sprint_name(name: str) -> str:
    """"Sprint 12" → "Sprint 13"; sem número no fim → "<nome> 2"."""
    match = re.search(r"(\d+)\s*$", name)
    if match:
        return f"{name[: match.start(1)]}{int(match.group(1)) + 1}"
    return f"{name} 2"


# ── iniciar ───────────────────────────────────────────────────────────────────

@transaction.atomic
def start_sprint(
    *,
    sprint_id: str,
    actor_id: str,
    name=None,
    start_date=None,
    end_date=None,
    goal=None,
    duration_days=UNSET,
) -> SprintModel:
    sprint = _get_sprint(sprint_id, actor_id)
    if sprint.status == "active":
        raise ValidationError("A sprint já está ativa.")
    if sprint.status == "closed":
        raise ValidationError("Sprint encerrada não pode ser reiniciada.")
    other = (
        SprintModel.objects.filter(project_id=sprint.project_id, status="active")
        .exclude(id=sprint.id)
        .first()
    )
    if other is not None:
        raise ValidationError(
            f"Já existe uma sprint ativa ({other.name}). Conclua-a antes de iniciar outra."
        )
    if not sprint.cards.exists():
        raise ValidationError("Adicione ao menos um card à sprint antes de iniciá-la.")

    if name is not None:
        if not str(name).strip():
            raise ValidationError("O nome da sprint não pode ficar vazio.")
        sprint.name = str(name).strip()
    if duration_days is not UNSET:
        sprint.duration_days = _parse_duration(duration_days)
    new_start = parse_date(start_date, "start_date")
    new_end = parse_date(end_date, "end_date")
    start = new_start or sprint.start_date or timezone.localdate()
    if new_end:
        end = new_end
    elif new_start or not sprint.end_date:
        # Início mudou (ou nunca teve fim): a duração reposiciona o fim.
        end = window_end(start, sprint.duration_days)
    else:
        end = sprint.end_date
    assert_date_order(start, end)
    sprint.start_date, sprint.end_date = start, end
    if goal is not None:
        sprint.goal = goal or ""
    sprint.status = "active"
    sprint.started_at = timezone.now()
    sprint.save()
    return sprint


# ── concluir ──────────────────────────────────────────────────────────────────

def complete_preview(*, sprint_id: str, actor_id: str) -> dict:
    """O que o diálogo de concluir mostra antes de confirmar."""
    sprint = _get_sprint(sprint_id, actor_id)
    done = done_slugs(sprint.project_id)
    cards = sprint.cards.all()
    return {
        "completed_cards": cards.filter(status__in=done).count(),
        "open_cards": cards.exclude(status__in=done).count(),
        "suggested_name": next_sprint_name(sprint.name),
    }


@transaction.atomic
def complete_sprint(
    *, sprint_id: str, actor_id: str, move_to: str = "backlog", new_sprint_name: str | None = None
) -> tuple[SprintModel, dict]:
    sprint = _get_sprint(sprint_id, actor_id)
    if sprint.status != "active":
        raise ValidationError("Só é possível concluir uma sprint ativa.")

    done = done_slugs(sprint.project_id)
    done_count = sprint.cards.filter(status__in=done).count()
    open_cards = list(sprint.cards.exclude(status__in=done))

    target: SprintModel | None
    if move_to == "backlog":
        target = None
    elif move_to == "new":
        name = (new_sprint_name or "").strip() or next_sprint_name(sprint.name)
        target = SprintModel.objects.create(project_id=sprint.project_id, name=name)
    else:
        target = (
            SprintModel.objects.filter(id=move_to, project_id=sprint.project_id)
            .exclude(id=sprint.id)
            .exclude(status="closed")
            .first()
            if _is_uuid(move_to)
            else None
        )
        if target is None:
            raise ValidationError("Sprint de destino inválida.")

    # Um a um (não `update()` em massa): cada saída vira histórico do card —
    # é o que reconstrói "planejado × concluído" depois.
    for card in open_cards:
        card.sprint = target
        card.save(update_fields=["sprint", "updated_at"])
        CardHistoryModel.objects.create(
            card=card,
            author_id=actor_id,
            field="sprint_id",
            old_value=str(sprint.id),
            new_value=str(target.id) if target else "",
        )

    sprint.status = "closed"
    sprint.completed_at = timezone.now()
    sprint.save(update_fields=["status", "completed_at", "updated_at"])
    return sprint, {
        "completed_cards": done_count,
        "moved_cards": len(open_cards),
        "moved_to": str(target.id) if target else "backlog",
    }


def _parse_duration(value) -> int | None:
    if value in (None, ""):
        return None
    try:
        days = int(value)
    except (TypeError, ValueError) as exc:
        raise ValidationError("Duração da sprint inválida.") from exc
    if not 1 <= days <= 365:
        raise ValidationError("A duração da sprint deve ficar entre 1 e 365 dias.")
    return days


def _is_uuid(value) -> bool:
    import uuid

    try:
        uuid.UUID(str(value))
    except ValueError:
        return False
    return True
