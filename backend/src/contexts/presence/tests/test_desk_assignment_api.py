"""Testes de API de atribuição de mesas: permissão + fluxo completo."""
import pytest
from rest_framework.test import APIClient

from contexts.identity.infrastructure.django.models import (
    MembershipModel,
    UserModel,
    WorkspaceModel,
)


@pytest.fixture
def scenario(db):
    owner = UserModel.objects.create_user(
        email="owner@t4e.com", password="x", full_name="Ana Owner", is_active=True
    )
    member = UserModel.objects.create_user(
        email="bob@t4e.com", password="x", full_name="Bob Dev", is_active=True
    )
    outsider = UserModel.objects.create_user(
        email="out@t4e.com", password="x", full_name="Zé Fora", is_active=True
    )
    ws = WorkspaceModel.objects.create(name="WS", slug="ws", owner=owner)
    MembershipModel.objects.create(workspace=ws, user=owner, role="owner")
    MembershipModel.objects.create(workspace=ws, user=member, role="member")
    return {"owner": owner, "member": member, "outsider": outsider, "ws": ws}


def _client(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


def test_get_lista_vazia_quando_ninguem_atribuido(scenario):
    c = _client(scenario["member"])
    r = c.get(f"/api/presence/desks/?workspace_id={scenario['ws'].id}&floor=1")
    assert r.status_code == 200
    assert r.data == []


def test_member_comum_nao_pode_atribuir(scenario):
    c = _client(scenario["member"])
    r = c.post(
        "/api/presence/desks/assign/",
        {
            "workspace_id": str(scenario["ws"].id),
            "floor": 1,
            "seat_id": "ws-9-4",
            "user_id": str(scenario["member"].id),
        },
        format="json",
    )
    assert r.status_code == 403


def test_outsider_nao_ve_nem_atribui(scenario):
    c = _client(scenario["outsider"])
    r_get = c.get(f"/api/presence/desks/?workspace_id={scenario['ws'].id}&floor=1")
    assert r_get.status_code == 403
    r_post = c.post(
        "/api/presence/desks/assign/",
        {
            "workspace_id": str(scenario["ws"].id),
            "floor": 1,
            "seat_id": "ws-9-4",
            "user_id": str(scenario["outsider"].id),
        },
        format="json",
    )
    assert r_post.status_code == 403


def test_owner_atribui_e_qualquer_membro_ve(scenario):
    owner_c = _client(scenario["owner"])
    r = owner_c.post(
        "/api/presence/desks/assign/",
        {
            "workspace_id": str(scenario["ws"].id),
            "floor": 1,
            "seat_id": "ws-9-4",
            "user_id": str(scenario["member"].id),
        },
        format="json",
    )
    assert r.status_code == 200
    assert r.data == [
        {
            "seat_id": "ws-9-4",
            "floor": 1,
            "user_id": str(scenario["member"].id),
            "user_name": "Bob Dev",
        }
    ]

    member_c = _client(scenario["member"])
    r_get = member_c.get(f"/api/presence/desks/?workspace_id={scenario['ws'].id}&floor=1")
    assert r_get.status_code == 200
    assert r_get.data == r.data


def test_atribuir_a_nao_membro_e_400(scenario):
    """Usuário real, mas de fora do workspace — não pode virar rótulo no mundo."""
    owner_c = _client(scenario["owner"])
    r = owner_c.post(
        "/api/presence/desks/assign/",
        {
            "workspace_id": str(scenario["ws"].id),
            "floor": 1,
            "seat_id": "ws-9-4",
            "user_id": str(scenario["outsider"].id),
        },
        format="json",
    )
    assert r.status_code == 400


def test_atribuir_com_user_id_malformado_e_400(scenario):
    owner_c = _client(scenario["owner"])
    r = owner_c.post(
        "/api/presence/desks/assign/",
        {
            "workspace_id": str(scenario["ws"].id),
            "floor": 1,
            "seat_id": "ws-9-4",
            "user_id": "nao-e-um-uuid",
        },
        format="json",
    )
    assert r.status_code == 400


def test_desatribuir_com_user_id_none(scenario):
    owner_c = _client(scenario["owner"])
    owner_c.post(
        "/api/presence/desks/assign/",
        {
            "workspace_id": str(scenario["ws"].id),
            "floor": 1,
            "seat_id": "ws-9-4",
            "user_id": str(scenario["member"].id),
        },
        format="json",
    )
    r = owner_c.post(
        "/api/presence/desks/assign/",
        {
            "workspace_id": str(scenario["ws"].id),
            "floor": 1,
            "seat_id": "ws-9-4",
            "user_id": None,
        },
        format="json",
    )
    assert r.status_code == 200
    assert r.data == []
