"""Testes do módulo OAuth social (montagem de URL, PKCE, config)."""
import base64
import hashlib
from urllib.parse import parse_qs, urlparse

from contexts.integrations.infrastructure import social_oauth


def test_all_providers_have_config():
    for name in ["instagram", "facebook", "linkedin", "x", "tiktok", "youtube"]:
        assert name in social_oauth.PROVIDERS


def test_pkce_pair_is_valid_s256():
    verifier, challenge = social_oauth.make_pkce_pair()
    expected = (
        base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest())
        .decode()
        .rstrip("=")
    )
    assert challenge == expected
    assert 43 <= len(verifier) <= 128


def test_build_authorize_url_x_includes_pkce(settings):
    settings.SOCIAL_X_CLIENT_ID = "cid"
    settings.SOCIAL_X_CLIENT_SECRET = "sec"
    settings.SOCIAL_OAUTH_REDIRECT_BASE = "http://localhost:8000"
    url = social_oauth.build_authorize_url("x", "st123", "chal")
    parsed = urlparse(url)
    q = parse_qs(parsed.query)
    assert parsed.netloc == "x.com"
    assert q["code_challenge"] == ["chal"]
    assert q["code_challenge_method"] == ["S256"]
    assert "tweet.write" in q["scope"][0]
    assert q["redirect_uri"] == [
        "http://localhost:8000/api/integrations/oauth/x/callback/"
    ]


def test_build_authorize_url_tiktok_uses_client_key(settings):
    settings.SOCIAL_TIKTOK_CLIENT_ID = "ck"
    settings.SOCIAL_TIKTOK_CLIENT_SECRET = "cs"
    url = social_oauth.build_authorize_url("tiktok", "st", "")
    q = parse_qs(urlparse(url).query)
    assert q["client_key"] == ["ck"]
    assert "client_id" not in q
    assert q["scope"] == ["user.info.basic,video.publish"]


def test_is_configured(settings):
    settings.SOCIAL_LINKEDIN_CLIENT_ID = "a"
    settings.SOCIAL_LINKEDIN_CLIENT_SECRET = "b"
    assert social_oauth.is_configured("linkedin")
    settings.SOCIAL_INSTAGRAM_CLIENT_ID = ""
    assert not social_oauth.is_configured("instagram")
