import pytest
from rest_framework.test import APIClient

from contexts.identity.infrastructure.django.models import PersonalAccessToken, UserModel
from contexts.identity.infrastructure.django.personal_token_authentication import (
    generate_token,
    hash_token,
)


@pytest.fixture
def user(db):
    return UserModel.objects.create_user(
        email="pat-auth@t4e.com", password="senha-123", full_name="PAT Auth", is_active=True
    )


@pytest.fixture
def client():
    return APIClient()


def test_valid_personal_token_authenticates_user(client, user):
    raw, digest = generate_token()
    PersonalAccessToken.objects.create(user=user, token_hash=digest)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {raw}")
    response = client.get("/api/auth/me/")
    assert response.status_code == 200
    assert response.data["email"] == "pat-auth@t4e.com"


def test_revoked_personal_token_is_rejected(client, user):
    from django.utils import timezone

    raw, digest = generate_token()
    PersonalAccessToken.objects.create(user=user, token_hash=digest, revoked_at=timezone.now())
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {raw}")
    response = client.get("/api/auth/me/")
    assert response.status_code == 401


def test_unknown_personal_token_is_rejected(client):
    client.credentials(HTTP_AUTHORIZATION="Bearer token-que-nao-existe")
    response = client.get("/api/auth/me/")
    assert response.status_code == 401


def test_valid_personal_token_updates_last_used_at(client, user):
    raw, digest = generate_token()
    token = PersonalAccessToken.objects.create(user=user, token_hash=digest)
    assert token.last_used_at is None
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {raw}")
    client.get("/api/auth/me/")
    token.refresh_from_db()
    assert token.last_used_at is not None


def test_hash_token_is_deterministic():
    assert hash_token("abc") == hash_token("abc")
    assert hash_token("abc") != hash_token("abd")
