import pytest
from rest_framework.test import APIClient

from contexts.identity.infrastructure.django.models import PersonalAccessToken, UserModel
from contexts.identity.infrastructure.django.personal_token_authentication import hash_token


@pytest.fixture
def user(db):
    return UserModel.objects.create_user(
        email="pat-api@t4e.com", password="senha-123", full_name="PAT API", is_active=True
    )


@pytest.fixture
def other_user(db):
    return UserModel.objects.create_user(
        email="other@t4e.com", password="senha-123", full_name="Other", is_active=True
    )


@pytest.fixture
def client(user):
    api = APIClient()
    api.force_authenticate(user)
    return api


def test_create_token_returns_raw_value_once(client, user):
    response = client.post("/api/auth/tokens/", {"name": "Claude Desktop"}, format="json")
    assert response.status_code == 201
    assert response.data["name"] == "Claude Desktop"
    assert response.data["token"].startswith("t4e_pat_")
    stored = PersonalAccessToken.objects.get(user=user)
    assert stored.token_hash == hash_token(response.data["token"])


def test_create_token_without_name_is_allowed(client):
    response = client.post("/api/auth/tokens/", {}, format="json")
    assert response.status_code == 201
    assert response.data["name"] == ""


def test_list_tokens_never_exposes_raw_value(client, user):
    client.post("/api/auth/tokens/", {"name": "CI"}, format="json")
    response = client.get("/api/auth/tokens/")
    assert response.status_code == 200
    assert len(response.data) == 1
    assert "token" not in response.data[0]
    assert response.data[0]["name"] == "CI"


def test_list_tokens_only_shows_own_tokens(client, user, other_user):
    PersonalAccessToken.objects.create(user=other_user, token_hash="c" * 64, name="Não é meu")
    response = client.get("/api/auth/tokens/")
    assert response.status_code == 200
    assert response.data == []


def test_revoke_token_sets_revoked_at(client, user):
    created = client.post("/api/auth/tokens/", {"name": "Temp"}, format="json")
    token_id = created.data["id"]
    response = client.delete(f"/api/auth/tokens/{token_id}/")
    assert response.status_code == 204
    stored = PersonalAccessToken.objects.get(id=token_id)
    assert stored.revoked_at is not None


def test_revoke_token_of_another_user_fails(client, other_user):
    token = PersonalAccessToken.objects.create(user=other_user, token_hash="d" * 64)
    response = client.delete(f"/api/auth/tokens/{token.id}/")
    assert response.status_code == 404
    token.refresh_from_db()
    assert token.revoked_at is None
