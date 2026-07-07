"""
Motor de execução de automações.

Dado um AutomationRuleModel, avalia condições e executa ações
sobre os CardModels do projeto.
"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING, Any

from django.db.models import Q

if TYPE_CHECKING:
    from contexts.projects.infrastructure.django.models import AutomationRunLogModel

# ── schedule → next_run_at ──────────────────────────────────────────────────

SCHEDULE_DELTAS: dict[str, timedelta] = {
    "hourly":         timedelta(hours=1),
    "daily_morning":  timedelta(hours=24),
    "daily_evening":  timedelta(hours=24),
    "weekly_monday":  timedelta(weeks=1),
}

def compute_next_run(schedule: str, from_: datetime | None = None) -> datetime:
    from_ = from_ or datetime.now(tz=UTC)
    delta = SCHEDULE_DELTAS.get(schedule, timedelta(hours=24))
    return from_ + delta


# ── condition evaluation ────────────────────────────────────────────────────

def _build_condition_q(conditions: list[dict]) -> Q:
    q = Q()
    for cond in conditions:
        field = cond.get("field", "")
        op    = cond.get("op", "=")
        value = cond.get("value", "")

        if field == "priority":
            db = "priority"
        elif field == "type":
            db = "type"
        elif field == "status":
            db = "status"
        elif field == "assignee":
            db = "assignee_id"
            if value == "unassigned":
                q &= Q(assignee_id__isnull=True)
                continue
        elif field == "due":
            if value == "overdue":
                q &= Q(due_date__lt=datetime.now(tz=UTC).date(), due_date__isnull=False)
                continue
            db = "due_date"
        elif field == "label":
            if op == "=":
                q &= Q(labels__contains=[value])
            elif op == "!=":
                q &= ~Q(labels__contains=[value])
            continue
        else:
            db = field

        if op == "=":
            q &= Q(**{db: value})
        elif op == "!=":
            q &= ~Q(**{db: value})
        elif op == "~":
            q &= Q(**{f"{db}__icontains": value})

    return q


# ── action execution ────────────────────────────────────────────────────────

def _apply_action(card_qs, action_type: str, action_config: dict[str, Any]) -> int:
    if action_type == "change_status":
        new_status = action_config.get("status", "")
        if not new_status:
            return 0
        return card_qs.update(status=new_status)

    if action_type == "assign_user":
        user_id = action_config.get("user_id")
        return card_qs.update(assignee_id=user_id)

    if action_type == "set_priority":
        priority = action_config.get("priority", "medium")
        return card_qs.update(priority=priority)

    if action_type in ("add_label", "remove_label"):
        label = action_config.get("label", "")
        if not label:
            return 0
        count = 0
        for card in card_qs:
            labels: list = list(card.labels or [])
            if action_type == "add_label" and label not in labels:
                labels.append(label)
                card.labels = labels
                card.save(update_fields=["labels"])
                count += 1
            elif action_type == "remove_label" and label in labels:
                labels.remove(label)
                card.labels = labels
                card.save(update_fields=["labels"])
                count += 1
        return count

    return 0


# ── main entry ──────────────────────────────────────────────────────────────

def run_rule(rule, triggered_by: str = "cron") -> AutomationRunLogModel:  # type: ignore[name-defined]
    from contexts.projects.infrastructure.django.models import (
        AutomationRunLogModel,
        CardModel,
    )

    error = ""
    affected = 0
    try:
        condition_q = _build_condition_q(rule.conditions or [])
        card_qs = CardModel.objects.filter(project_id=rule.project_id).filter(condition_q)
        affected = _apply_action(card_qs, rule.action_type, rule.action_config)
    except Exception as exc:  # noqa: BLE001
        error = str(exc)

    now = datetime.now(tz=UTC)
    rule.last_run_at = now
    rule.run_count += 1
    if rule.trigger_type == "cron":
        schedule = (rule.trigger_config or {}).get("schedule", "daily_morning")
        rule.next_run_at = compute_next_run(schedule, from_=now)
    rule.save(update_fields=["last_run_at", "run_count", "next_run_at"])

    # Notify project members (project owner via workspace members) about automation run
    try:
        from contexts.identity.infrastructure.django.models import MembershipModel
        from contexts.projects.interface.api.notification_views import notify
        member_ids = MembershipModel.objects.filter(
            workspace_id=rule.project.workspace_id
        ).values_list("user_id", flat=True)
        status_str = "com erro" if error else f"{affected} cards afetados"
        for uid in member_ids:
            notify(
                user_id=str(uid),
                notif_type="automation_ran",
                title=f"Automação '{rule.name}' executada ({status_str})",
                link="/boards",
            )
    except Exception:  # noqa: BLE001
        pass

    return AutomationRunLogModel.objects.create(
        rule=rule,
        triggered_by=triggered_by,
        cards_affected=affected,
        error=error,
    )
