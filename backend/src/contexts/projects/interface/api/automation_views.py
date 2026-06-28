"""CRUD de regras de automação + trigger manual."""
from datetime import datetime, timezone

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from contexts.projects.infrastructure.django.models import (
    AutomationRunLogModel,
    AutomationRuleModel,
)
from contexts.projects.interface.api.automation_engine import compute_next_run, run_rule
from contexts.projects.interface.api import capabilities as caps
from contexts.projects.interface.api.permissions import (
    assert_project_capability,
    assert_project_member,
)


def _guard_rule(rule_id: str, user_id: str) -> AutomationRuleModel | None:
    """Resolve a rule e valida MANAGE_AUTOMATION no projeto. None se não existe."""
    rule = AutomationRuleModel.objects.filter(id=rule_id).first()
    if rule is None:
        return None
    assert_project_capability(
        project_id=str(rule.project_id), user_id=user_id, capability=caps.MANAGE_AUTOMATION
    )
    return rule


def _ser_rule(r: AutomationRuleModel) -> dict:
    return {
        "id": str(r.id),
        "project_id": str(r.project_id),
        "name": r.name,
        "enabled": r.enabled,
        "trigger_type": r.trigger_type,
        "trigger_config": r.trigger_config,
        "conditions": r.conditions,
        "action_type": r.action_type,
        "action_config": r.action_config,
        "last_run_at": r.last_run_at,
        "next_run_at": r.next_run_at,
        "run_count": r.run_count,
        "created_at": r.created_at,
    }


def _ser_log(log: AutomationRunLogModel) -> dict:
    return {
        "id": str(log.id),
        "rule_id": str(log.rule_id),
        "triggered_by": log.triggered_by,
        "cards_affected": log.cards_affected,
        "error": log.error,
        "ran_at": log.ran_at,
    }


class AutomationRuleListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request, project_id: str) -> Response:
        assert_project_member(project_id=str(project_id), user_id=str(request.user.id))
        rules = AutomationRuleModel.objects.filter(project_id=project_id)
        return Response([_ser_rule(r) for r in rules])

    def post(self, request: Request, project_id: str) -> Response:
        assert_project_capability(
            project_id=str(project_id), user_id=str(request.user.id), capability=caps.MANAGE_AUTOMATION
        )
        data = request.data
        name = data.get("name", "").strip()
        if not name:
            return Response({"detail": "name required"}, status=status.HTTP_400_BAD_REQUEST)

        trigger_type = data.get("trigger_type", "cron")
        trigger_config = data.get("trigger_config", {})
        action_type = data.get("action_type", "")
        action_config = data.get("action_config", {})
        conditions = data.get("conditions", [])

        next_run_at = None
        if trigger_type == "cron":
            schedule = trigger_config.get("schedule", "daily_morning")
            next_run_at = compute_next_run(schedule)

        rule = AutomationRuleModel.objects.create(
            project_id=project_id,
            name=name,
            enabled=data.get("enabled", True),
            trigger_type=trigger_type,
            trigger_config=trigger_config,
            conditions=conditions,
            action_type=action_type,
            action_config=action_config,
            next_run_at=next_run_at,
        )
        return Response(_ser_rule(rule), status=status.HTTP_201_CREATED)


class AutomationRuleDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request: Request, rule_id: str) -> Response:
        rule = _guard_rule(str(rule_id), str(request.user.id))
        if not rule:
            return Response(status=status.HTTP_404_NOT_FOUND)
        data = request.data
        for field in ("name", "enabled", "trigger_type", "trigger_config", "conditions", "action_type", "action_config"):
            if field in data:
                setattr(rule, field, data[field])
        # Recompute next_run_at if schedule changed
        if "trigger_config" in data and rule.trigger_type == "cron":
            schedule = rule.trigger_config.get("schedule", "daily_morning")
            rule.next_run_at = compute_next_run(schedule)
        rule.save()
        return Response(_ser_rule(rule))

    def delete(self, request: Request, rule_id: str) -> Response:
        rule = _guard_rule(str(rule_id), str(request.user.id))
        if not rule:
            return Response(status=status.HTTP_404_NOT_FOUND)
        rule.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class AutomationRuleRunView(APIView):
    """POST /automation-rules/<id>/run/ → executa manualmente."""

    permission_classes = [IsAuthenticated]

    def post(self, request: Request, rule_id: str) -> Response:
        rule = _guard_rule(str(rule_id), str(request.user.id))
        if not rule:
            return Response(status=status.HTTP_404_NOT_FOUND)

        log = run_rule(rule, triggered_by="manual")
        return Response(_ser_log(log), status=status.HTTP_200_OK)


class AutomationRunLogView(APIView):
    """GET /automation-rules/<id>/logs/ → histórico de execuções."""

    permission_classes = [IsAuthenticated]

    def get(self, request: Request, rule_id: str) -> Response:
        if _guard_rule(str(rule_id), str(request.user.id)) is None:
            return Response(status=status.HTTP_404_NOT_FOUND)
        logs = AutomationRunLogModel.objects.filter(rule_id=rule_id)[:50]
        return Response([_ser_log(log) for log in logs])
