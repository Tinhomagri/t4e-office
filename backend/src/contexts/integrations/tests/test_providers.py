"""Testes da coleta simulada de métricas de publicação."""
from contexts.integrations.infrastructure import providers


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
