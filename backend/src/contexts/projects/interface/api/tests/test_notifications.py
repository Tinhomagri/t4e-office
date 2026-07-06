"""Integração da API de notificações in-app (RF-06)."""
import pytest
from rest_framework.test import APIClient

from contexts.identity.infrastructure.django.models import UserModel
from contexts.projects.infrastructure.django.models import NotificationModel


@pytest.fixture
def users(db):
    ana = UserModel.objects.create_user(
        email="ana@t4e.com", password="x", full_name="Ana", is_active=True
    )
    bruno = UserModel.objects.create_user(
        email="bruno@t4e.com", password="x", full_name="Bruno", is_active=True
    )
    return ana, bruno


def _notif(user, title="Você foi atribuído", read=False):
    return NotificationModel.objects.create(
        user_id=str(user.id), type="card_assigned", title=title, read=read
    )


def _client(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


def test_lista_retorna_apenas_notificacoes_do_usuario(users):
    ana, bruno = users
    _notif(ana, "da Ana")
    _notif(bruno, "do Bruno")

    resp = _client(ana).get("/api/notifications/")
    assert resp.status_code == 200
    titles = [n["title"] for n in resp.json()]
    assert titles == ["da Ana"]


def test_read_all_marca_somente_as_nao_lidas(users):
    ana, _ = users
    _notif(ana, "n1", read=False)
    _notif(ana, "n2", read=False)
    _notif(ana, "n3", read=True)

    resp = _client(ana).post("/api/notifications/read-all/")
    assert resp.status_code == 200
    assert resp.json() == {"marked_read": 2}
    assert NotificationModel.objects.filter(user_id=str(ana.id), read=False).count() == 0


def test_patch_marca_uma_como_lida(users):
    ana, _ = users
    n = _notif(ana)
    resp = _client(ana).patch(f"/api/notifications/{n.id}/")
    assert resp.status_code == 200
    assert resp.json()["read"] is True
    n.refresh_from_db()
    assert n.read is True


def test_nao_marca_notificacao_de_outro_usuario(users):
    ana, bruno = users
    alheia = _notif(bruno)
    resp = _client(ana).patch(f"/api/notifications/{alheia.id}/")
    assert resp.status_code == 404
    alheia.refresh_from_db()
    assert alheia.read is False


def test_exige_autenticacao(db):
    resp = APIClient().get("/api/notifications/")
    assert resp.status_code in (401, 403)
