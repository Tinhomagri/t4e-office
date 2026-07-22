"""Testes da fila social: caption com menções, lista de mídia e retry/backoff."""
import types

from contexts.integrations.infrastructure import publishing_service, social_publisher


def _post(**kw):
    base = {
        "content": "Lançamento!",
        "media_url": "",
        "media_urls": [],
        "mentions": [],
    }
    base.update(kw)
    return types.SimpleNamespace(**base)


def test_caption_appends_mentions_not_already_present():
    p = _post(content="Novidade chegando", mentions=["ana", "@bruno"])
    out = social_publisher._caption(p)
    assert "@ana" in out and "@bruno" in out
    assert out.count("@bruno") == 1


def test_caption_skips_mention_already_in_text():
    p = _post(content="Obrigado @ana pela ajuda", mentions=["ana"])
    assert social_publisher._caption(p).count("@ana") == 1


def test_media_list_prefers_carousel_then_single():
    assert social_publisher._media_list(_post(media_urls=["a", "b"])) == ["a", "b"]
    assert social_publisher._media_list(_post(media_url="x")) == ["x"]
    assert social_publisher._media_list(_post()) == []


def test_is_video_detects_extension_with_querystring():
    assert social_publisher._is_video("https://c/x.mp4?sig=1")
    assert not social_publisher._is_video("https://c/x.jpg")


def test_retry_backoff_then_failed():
    """1ª e 2ª falha reagendam (scheduled + backoff); 3ª marca failed."""
    saved = {"n": 0}
    post = _post(status="scheduled", attempts=0, error="", next_attempt_at=None)
    post.save = lambda *a, **k: saved.__setitem__("n", saved["n"] + 1)

    # attempts=1 → scheduled com backoff
    ok = publishing_service._handle_failure(post, "boom")
    assert ok is False and post.status == "scheduled" and post.next_attempt_at is not None
    post.attempts = 2
    publishing_service._handle_failure(post, "boom")
    assert post.status == "scheduled"
    post.attempts = publishing_service.MAX_ATTEMPTS
    publishing_service._handle_failure(post, "boom")
    assert post.status == "failed" and post.next_attempt_at is None
