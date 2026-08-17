"""Testes das traduções Jira → T4E Office."""
import pytest

from contexts.jira.infrastructure.mapping import (
    map_issue_type,
    map_priority,
    map_resolution,
    map_status_category,
)


@pytest.mark.parametrize(
    "jira_name,expected",
    [("Bug", "bug"), ("Story", "feature"), ("Epic", "epic"), ("Spike", "spike"), ("Task", "chore")],
)
def test_map_issue_type(jira_name, expected):
    assert map_issue_type(jira_name) == expected


def test_map_issue_type_desconhecido_cai_em_chore():
    assert map_issue_type("Cargo Não Existe") == "chore"


@pytest.mark.parametrize(
    "jira_name,expected",
    [("Highest", "urgent"), ("High", "high"), ("Medium", "medium"), ("Low", "low"), ("Lowest", "low")],
)
def test_map_priority(jira_name, expected):
    assert map_priority(jira_name) == expected


def test_map_priority_ausente_cai_em_medium():
    assert map_priority(None) == "medium"


@pytest.mark.parametrize(
    "category_key,expected",
    [("new", "todo"), ("indeterminate", "in_progress"), ("done", "done")],
)
def test_map_status_category(category_key, expected):
    assert map_status_category(category_key) == expected


def test_map_status_category_desconhecida_cai_em_todo():
    assert map_status_category("qualquer-coisa") == "todo"


def test_map_resolution_conhecida():
    assert map_resolution("Done") == "done"
    assert map_resolution("Duplicate") == "duplicate"


def test_map_resolution_ausente_fica_vazia():
    assert map_resolution(None) == ""
