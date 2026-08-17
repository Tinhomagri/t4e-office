"""Traduções puras entre vocabulário do Jira e o do T4E Office.

Cada função tem um valor-padrão sensato para nomes desconhecidos, porque
instâncias Jira têm tipos/prioridades customizados que não dá para prever.
"""
from __future__ import annotations

_TYPE_MAP = {
    "bug": "bug",
    "story": "feature",
    "epic": "epic",
    "spike": "spike",
}

_PRIORITY_MAP = {
    "highest": "urgent",
    "high": "high",
    "medium": "medium",
    "low": "low",
    "lowest": "low",
}

_STATUS_CATEGORY_MAP = {
    "new": "todo",
    "indeterminate": "in_progress",
    "done": "done",
}

_RESOLUTION_MAP = {
    "done": "done",
    "fixed": "done",
    "resolved": "done",
    "won't do": "wont_do",
    "won't fix": "wont_do",
    "duplicate": "duplicate",
    "cannot reproduce": "cannot_reproduce",
    "incomplete": "incomplete",
}


def map_issue_type(jira_type_name: str) -> str:
    return _TYPE_MAP.get((jira_type_name or "").strip().lower(), "chore")


def map_priority(jira_priority_name: str | None) -> str:
    return _PRIORITY_MAP.get((jira_priority_name or "").strip().lower(), "medium")


def map_status_category(jira_status_category_key: str | None) -> str:
    return _STATUS_CATEGORY_MAP.get((jira_status_category_key or "").strip().lower(), "todo")


# Paletas por categoria — o import criava toda coluna com a mesma cor cinza
# padrão do model (WorkflowStatusModel.color default), o que deixava os
# gráficos de portfólio/relatório monocromáticos mesmo com dado real por
# trás. Categoria fixa a família de cor (verde = concluído em qualquer
# projeto); o hash do nome varia o tom dentro da família pra colunas
# diferentes não colidirem.
_CATEGORY_PALETTE = {
    "todo": ["#8590A2", "#CD519D", "#E2B203", "#E56910"],
    "in_progress": ["#8270DB", "#6E5DC6", "#2898BD", "#9F8FEF"],
    "done": ["#1F845A", "#2ABB7F", "#36B37E"],
}


def status_color(status_name: str, category: str) -> str:
    palette = _CATEGORY_PALETTE.get(category, _CATEGORY_PALETTE["todo"])
    h = sum(ord(c) for c in status_name)
    return palette[h % len(palette)]


def map_resolution(jira_resolution_name: str | None) -> str:
    return _RESOLUTION_MAP.get((jira_resolution_name or "").strip().lower(), "")
