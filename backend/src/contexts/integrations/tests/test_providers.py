"""Testes dos parsers de import e da coleta simulada."""
from contexts.integrations.infrastructure import providers


def test_parse_jira_maps_status_and_type():
    payload = {
        "issues": [
            {
                "key": "PROJ-1",
                "fields": {
                    "summary": "Corrigir login",
                    "description": "detalhe",
                    "status": {"name": "In Progress"},
                    "issuetype": {"name": "Bug"},
                },
            },
            {"key": "PROJ-2", "fields": {"summary": "História X", "status": {"name": "Done"}}},
        ]
    }
    items = providers.parse_jira(payload)
    assert len(items) == 2
    assert items[0] == {
        "external_key": "PROJ-1",
        "title": "Corrigir login",
        "description": "detalhe",
        "status": "doing",
        "type": "bug",
        "external_status": "in progress",
    }
    assert items[1]["status"] == "done"
    assert items[1]["type"] == "chore"


def test_parse_trello_maps_lists_and_skips_closed():
    payload = {
        "lists": [
            {"id": "l1", "name": "Em Andamento"},
            {"id": "l2", "name": "Concluído"},
        ],
        "cards": [
            {"id": "c1", "name": "Card A", "desc": "d", "idList": "l1"},
            {"id": "c2", "name": "Card B", "idList": "l2"},
            {"id": "c3", "name": "Arquivado", "idList": "l2", "closed": True},
        ],
    }
    items = providers.parse_trello(payload)
    assert [i["title"] for i in items] == ["Card A", "Card B"]
    assert items[0]["status"] == "doing"
    assert items[1]["status"] == "done"


def test_parse_import_unknown_provider():
    import pytest

    with pytest.raises(ValueError):
        providers.parse_import("asana", {})


class _FakeAccount:
    channel = "instagram"


class _FakePost:
    id = "abc-123"
    account = _FakeAccount()
    published_at = None
    content = "Olá"
    media_url = ""
    media_urls: list = []
    mentions: list = []


def test_publish_and_metrics_deterministic(settings):
    settings.SOCIAL_SIMULATE = True
    post = _FakePost()
    assert providers.publish_post(post)["external_id"] == "instagram_abc-123"
    m1 = providers.collect_metrics(post)
    m2 = providers.collect_metrics(post)
    assert m1 == m2
    assert m1["impressions"] > 0
    assert m1["likes"] <= m1["impressions"]
