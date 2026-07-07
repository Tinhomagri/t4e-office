"""
Minimal JQL parser → Django Q objects.

Supported syntax (clauses joined by AND):
  status = todo
  priority = high
  type = bug
  assignee = me | <uuid>
  sprint = active | <uuid>
  label = "bug-fix"
  text ~ "search term"       (title OR description icontains)
  due <= 2024-12-31
  due >= 2024-01-01
"""
from __future__ import annotations

import re
from typing import Any

from django.db.models import Q

_CLAUSE_RE = re.compile(
    r"""
    (?P<field>\w+)          # field name
    \s*
    (?P<op>=|!=|~|<=|>=|<|>)  # operator
    \s*
    (?:"(?P<qval>[^"]*)"     # "quoted value"
    |(?P<val>\S+))           # or bare value
    """,
    re.VERBOSE,
)

_FIELD_MAP: dict[str, str] = {
    "status": "status",
    "priority": "priority",
    "type": "type",
    "assignee": "assignee_id",
    "reporter": "reporter_id",
    "sprint": "sprint_id",
    "label": "labels",
    "due": "due_date",
    "start": "start_date",
}


def parse_jql(jql: str, actor_id: str | None = None) -> Q:
    """Return a Q object for the given JQL string. Raises ValueError on bad syntax."""
    clauses = re.split(r"\s+AND\s+", jql.strip(), flags=re.IGNORECASE)
    q = Q()
    for clause in clauses:
        clause = clause.strip()
        if not clause:
            continue
        m = _CLAUSE_RE.fullmatch(clause)
        if not m:
            raise ValueError(f"Invalid JQL clause: {clause!r}")
        field = m.group("field").lower()
        op = m.group("op")
        value: Any = m.group("qval") if m.group("qval") is not None else m.group("val")

        if field == "text":
            if op != "~":
                raise ValueError("'text' field only supports '~' operator")
            q &= Q(title__icontains=value) | Q(description__icontains=value)
            continue

        if field == "label":
            # labels is a JSONField array; use __contains for list membership
            if op == "=":
                q &= Q(labels__contains=[value])
            elif op == "!=":
                q &= ~Q(labels__contains=[value])
            else:
                raise ValueError("'label' field only supports '=' and '!='")
            continue

        if field == "assignee" and value.lower() == "me" and actor_id:
            value = actor_id

        if field == "reporter" and value.lower() == "me" and actor_id:
            value = actor_id

        if field == "sprint" and value.lower() == "active":
            # resolve to the active sprint id — use a subquery-friendly approach
            from contexts.projects.infrastructure.django.models import SprintModel
            active_ids = list(
                SprintModel.objects.filter(status="active").values_list("id", flat=True)
            )
            if not active_ids:
                q &= Q(pk=None)  # no active sprint → zero results
            else:
                q &= Q(sprint_id__in=[str(i) for i in active_ids])
            continue

        db_field = _FIELD_MAP.get(field, field)

        if op == "=":
            q &= Q(**{db_field: value})
        elif op == "!=":
            q &= ~Q(**{db_field: value})
        elif op == "~":
            q &= Q(**{f"{db_field}__icontains": value})
        elif op == "<=":
            q &= Q(**{f"{db_field}__lte": value})
        elif op == ">=":
            q &= Q(**{f"{db_field}__gte": value})
        elif op == "<":
            q &= Q(**{f"{db_field}__lt": value})
        elif op == ">":
            q &= Q(**{f"{db_field}__gt": value})

    return q
