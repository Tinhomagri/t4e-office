import pytest
from django.utils import timezone
from datetime import timedelta

from contexts.identity.infrastructure.django.models import (
    OAuthAuthorizationCodeModel,
    OAuthClientModel,
    UserModel,
)


@pytest.fixture
def user(db):
    return UserModel.objects.create_user(
        email="oauth@t4e.com", password="x", full_name="OAuth User", is_active=True
    )


def test_oauth_client_criacao_basica(db):
    client = OAuthClientModel.objects.create(
        client_id="abc123",
        client_name="Claude",
        redirect_uris=["https://claude.ai/api/mcp/callback"],
    )
    assert client.client_id == "abc123"
    assert client.redirect_uris == ["https://claude.ai/api/mcp/callback"]


def test_oauth_authorization_code_vinculado_a_usuario(user):
    code = OAuthAuthorizationCodeModel.objects.create(
        code="deadbeef",
        client_id="abc123",
        user=user,
        redirect_uri="https://mcp.t4egroup.com.br/oauth/django-callback",
        expires_at=timezone.now() + timedelta(minutes=2),
    )
    assert code.used_at is None
    assert code.user_id == user.id
