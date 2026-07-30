"""Refresh de token: token órfão precisa dar 401, não 500."""
import pytest
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from contexts.identity.infrastructure.django.models import UserModel


@pytest.fixture
def user(db):
    return UserModel.objects.create_user(
        email="ana@t4e.com", password="x", full_name="Ana", is_active=True
    )


def test_refresh_valido_devolve_novo_access(user):
    refresh = str(RefreshToken.for_user(user))
    res = APIClient().post("/api/auth/refresh/", {"refresh": refresh}, format="json")
    assert res.status_code == 200
    assert "access" in res.data


def test_refresh_de_usuario_removido_devolve_401(user):
    """Banco recriado ou usuário deletado com refresh token ainda no browser.

    Antes o serializer do simplejwt deixava UserModel.DoesNotExist subir e a
    resposta era 500 — o front não tratava e ficava preso na tela de login.
    """
    refresh = str(RefreshToken.for_user(user))
    user.delete()
    res = APIClient().post("/api/auth/refresh/", {"refresh": refresh}, format="json")
    assert res.status_code == 401
