import pytest
from datetime import timedelta
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from contexts.identity.infrastructure.django.models import (
    OAuthAuthorizationCodeModel,
    OAuthClientModel,
    PersonalAccessToken,
    UserModel,
)

SECRET = "test-internal-secret"


@pytest.fixture
def user(db):
    return UserModel.objects.create_user(
        email="oauth@t4e.com", password="x", full_name="OAuth User", is_active=True
    )


def test_register_client_e_idempotente(db):
    client = APIClient()
    payload = {"client_id": "abc", "client_name": "Claude", "redirect_uris": ["https://claude.ai/cb"]}
    r1 = client.post("/api/oauth/clients/", payload, format="json")
    r2 = client.post("/api/oauth/clients/", payload, format="json")
    assert r1.status_code in (200, 201)
    assert r2.status_code in (200, 201)
    assert OAuthClientModel.objects.filter(client_id="abc").count() == 1


def test_get_client_inexistente_e_404(db):
    client = APIClient()
    resp = client.get("/api/oauth/clients/nao-existe/")
    assert resp.status_code == 404


def test_authorize_code_exige_login(db):
    OAuthClientModel.objects.create(client_id="abc", redirect_uris=["https://x/cb"])
    client = APIClient()
    resp = client.post(
        "/api/oauth/authorize-code/",
        {"client_id": "abc", "redirect_uri": "https://mcp.t4egroup.com.br/oauth/django-callback"},
        format="json",
    )
    assert resp.status_code == 401


def test_authorize_code_gera_codigo_pro_usuario_logado(user):
    client = APIClient()
    client.force_authenticate(user=user)
    resp = client.post(
        "/api/oauth/authorize-code/",
        {"client_id": "abc", "redirect_uri": "https://mcp.t4egroup.com.br/oauth/django-callback"},
        format="json",
    )
    assert resp.status_code == 200
    code = resp.data["code"]
    row = OAuthAuthorizationCodeModel.objects.get(code=code)
    assert row.user_id == user.id


@override_settings(OAUTH_INTERNAL_SECRET=SECRET)
def test_token_exchange_sem_segredo_e_403(user):
    row = OAuthAuthorizationCodeModel.objects.create(
        code="c1", client_id="abc", user=user, redirect_uri="https://x/cb",
        expires_at=timezone.now() + timedelta(minutes=2),
    )
    client = APIClient()
    resp = client.post("/api/oauth/token-exchange/", {"code": row.code}, format="json")
    assert resp.status_code == 403


@override_settings(OAUTH_INTERNAL_SECRET=SECRET)
def test_token_exchange_com_segredo_devolve_token_valido(user):
    row = OAuthAuthorizationCodeModel.objects.create(
        code="c2", client_id="abc", user=user, redirect_uri="https://x/cb",
        expires_at=timezone.now() + timedelta(minutes=2),
    )
    client = APIClient()
    resp = client.post(
        "/api/oauth/token-exchange/", {"code": row.code}, format="json",
        HTTP_X_INTERNAL_SECRET=SECRET,
    )
    assert resp.status_code == 200
    assert resp.data["access_token"].startswith("t4e_pat_")
    row.refresh_from_db()
    assert row.used_at is not None
    # o token devolvido tem que autenticar de verdade
    me = APIClient().get("/api/auth/me/", HTTP_AUTHORIZATION=f"Bearer {resp.data['access_token']}")
    assert me.status_code == 200
    assert me.data["email"] == user.email


@override_settings(OAUTH_INTERNAL_SECRET=SECRET)
def test_token_exchange_codigo_ja_usado_e_rejeitado(user):
    row = OAuthAuthorizationCodeModel.objects.create(
        code="c3", client_id="abc", user=user, redirect_uri="https://x/cb",
        expires_at=timezone.now() + timedelta(minutes=2), used_at=timezone.now(),
    )
    client = APIClient()
    resp = client.post(
        "/api/oauth/token-exchange/", {"code": row.code}, format="json",
        HTTP_X_INTERNAL_SECRET=SECRET,
    )
    assert resp.status_code == 400


@override_settings(OAUTH_INTERNAL_SECRET=SECRET)
def test_token_exchange_codigo_expirado_e_rejeitado(user):
    row = OAuthAuthorizationCodeModel.objects.create(
        code="c4", client_id="abc", user=user, redirect_uri="https://x/cb",
        expires_at=timezone.now() - timedelta(minutes=1),
    )
    client = APIClient()
    resp = client.post(
        "/api/oauth/token-exchange/", {"code": row.code}, format="json",
        HTTP_X_INTERNAL_SECRET=SECRET,
    )
    assert resp.status_code == 400


@override_settings(OAUTH_INTERNAL_SECRET=SECRET)
def test_revoke_by_value_torna_token_invalido(user):
    from contexts.identity.infrastructure.django.personal_token_authentication import generate_token
    raw, digest = generate_token()
    PersonalAccessToken.objects.create(user=user, token_hash=digest, name="teste")

    client = APIClient()
    resp = client.post(
        "/api/oauth/revoke-by-value/", {"access_token": raw}, format="json",
        HTTP_X_INTERNAL_SECRET=SECRET,
    )
    assert resp.status_code == 204
    me = APIClient().get("/api/auth/me/", HTTP_AUTHORIZATION=f"Bearer {raw}")
    assert me.status_code == 401


@override_settings(OAUTH_INTERNAL_SECRET=SECRET)
def test_revoke_by_value_token_inexistente_ainda_devolve_204(db):
    client = APIClient()
    resp = client.post(
        "/api/oauth/revoke-by-value/", {"access_token": "t4e_pat_naoexiste"}, format="json",
        HTTP_X_INTERNAL_SECRET=SECRET,
    )
    assert resp.status_code == 204
