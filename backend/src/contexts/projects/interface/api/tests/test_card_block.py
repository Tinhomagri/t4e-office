"""Card bloqueado com motivo, tipos suporte/melhoria e "pedido do cliente"."""
import pytest
from rest_framework.test import APIClient

from contexts.identity.infrastructure.django.models import (
    MembershipModel,
    UserModel,
    WorkspaceModel,
)
from contexts.projects.infrastructure.django.models import (
    CardHistoryModel,
    CardModel,
    ProjectModel,
)


@pytest.fixture
def scenario(db):
    owner = UserModel.objects.create_user(
        email="owner@t4e.com", password="x", full_name="Owner", is_active=True
    )
    ws = WorkspaceModel.objects.create(name="WS", slug="ws", owner=owner)
    MembershipModel.objects.create(workspace=ws, user=owner, role="owner")
    project = ProjectModel.objects.create(workspace=ws, name="Proj", key="PRJ")
    card = CardModel.objects.create(project=project, number=1, title="C1")
    client = APIClient()
    client.force_authenticate(user=owner)
    return {"card": card, "client": client}


def _patch(scenario, payload):
    return scenario["client"].patch(
        f"/api/cards/{scenario['card'].id}/", payload, format="json"
    )


def test_bloquear_com_motivo_grava_data_e_historico(scenario):
    resp = _patch(scenario, {"blocked": True, "block_reason": "Aguardando acesso"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["blocked"] is True
    assert body["block_reason"] == "Aguardando acesso"
    card = CardModel.objects.get(pk=scenario["card"].pk)
    assert card.blocked_at is not None
    assert CardHistoryModel.objects.filter(card=card, field="blocked", new_value="1").exists()


def test_bloquear_sem_motivo_400(scenario):
    assert _patch(scenario, {"blocked": True}).status_code == 400


def test_desbloquear_limpa_motivo_e_data(scenario):
    _patch(scenario, {"blocked": True, "block_reason": "x"})
    resp = _patch(scenario, {"blocked": False})
    assert resp.status_code == 200
    card = CardModel.objects.get(pk=scenario["card"].pk)
    assert (card.blocked, card.block_reason, card.blocked_at) == (False, "", None)


@pytest.mark.parametrize("tipo", ["support", "improvement"])
def test_tipos_novos(scenario, tipo):
    resp = _patch(scenario, {"type": tipo})
    assert resp.status_code == 200
    assert resp.json()["type"] == tipo


def test_pedido_do_cliente_aceita_null(scenario):
    assert _patch(scenario, {"client_request": True}).json()["client_request"] is True
    assert _patch(scenario, {"client_request": None}).json()["client_request"] is None
