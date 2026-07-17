"""Testes de API do Escritório Virtual: heartbeat, sala, status, avatar."""
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
    other = UserModel.objects.create_user(
        email="bob@t4e.com", password="x", full_name="Bob Dev", is_active=True
    )
    outsider = UserModel.objects.create_user(
        email="out@t4e.com", password="x", full_name="Zé Fora", is_active=True
    )
    ws = WorkspaceModel.objects.create(name="WS", slug="ws", owner=owner)
    MembershipModel.objects.create(workspace=ws, user=owner, role="owner")
    MembershipModel.objects.create(workspace=ws, user=other, role="member")
    return {"owner": owner, "other": other, "outsider": outsider, "ws": ws}


def _client(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


def test_heartbeat_cria_presenca_e_aparece_na_sala(scenario):
    ws_id = str(scenario["ws"].id)
    c = _client(scenario["owner"])

    r = c.post(
        "/api/presence/heartbeat/",
        {"workspace_id": ws_id, "x": 0.3, "y": 0.7, "facing": "left"},
        format="json",
    )
    assert r.status_code == 200
    # Acabou de mover → não é 'away'.
    assert r.data["status"] in {"available", "meeting", "focus"}

    room = c.get(f"/api/presence/room/?workspace_id={ws_id}")
    assert room.status_code == 200
    assert len(room.data) == 1
    me = room.data[0]
    assert me["name"] == "Ana Owner"
    assert me["x"] == 0.3 and me["facing"] == "left"


def test_room_bloqueia_nao_membro(scenario):
    ws_id = str(scenario["ws"].id)
    r = _client(scenario["outsider"]).get(f"/api/presence/room/?workspace_id={ws_id}")
    assert r.status_code == 403


def test_heartbeat_bloqueia_nao_membro(scenario):
    ws_id = str(scenario["ws"].id)
    r = _client(scenario["outsider"]).post(
        "/api/presence/heartbeat/", {"workspace_id": ws_id}, format="json"
    )
    assert r.status_code == 403


def test_coordenadas_sao_clampeadas(scenario):
    ws_id = str(scenario["ws"].id)
    c = _client(scenario["owner"])
    c.post(
        "/api/presence/heartbeat/",
        {"workspace_id": ws_id, "x": 5, "y": -2},
        format="json",
    )
    room = c.get(f"/api/presence/room/?workspace_id={ws_id}")
    assert room.data[0]["x"] == 1.0
    assert room.data[0]["y"] == 0.0


def test_status_manual_override(scenario):
    ws_id = str(scenario["ws"].id)
    c = _client(scenario["owner"])
    c.post("/api/presence/heartbeat/", {"workspace_id": ws_id}, format="json")

    r = c.put(
        "/api/presence/status/",
        {"workspace_id": ws_id, "status": "focus"},
        format="json",
    )
    assert r.status_code == 200
    assert r.data["status"] == "focus"

    # Limpa override → volta ao automático.
    r = c.put(
        "/api/presence/status/",
        {"workspace_id": ws_id, "status": "auto"},
        format="json",
    )
    assert r.data["status"] in {"available", "meeting"}


def test_status_invalido_400(scenario):
    ws_id = str(scenario["ws"].id)
    c = _client(scenario["owner"])
    r = c.put(
        "/api/presence/status/",
        {"workspace_id": ws_id, "status": "sleeping"},
        format="json",
    )
    assert r.status_code == 400


def test_avatar_save_e_get(scenario):
    c = _client(scenario["owner"])
    assert c.get("/api/presence/avatar/").data["config"] is None

    cfg = {"gender": "female", "name": "Ana", "skin": 2}
    r = c.put("/api/presence/avatar/", {"config": cfg}, format="json")
    assert r.status_code == 200
    assert r.data["config"]["name"] == "Ana"
    assert c.get("/api/presence/avatar/").data["config"]["skin"] == 2


def test_avatar_aparece_na_sala(scenario):
    ws_id = str(scenario["ws"].id)
    c = _client(scenario["other"])
    c.put(
        "/api/presence/avatar/",
        {"config": {"name": "Bob", "hair": 3}},
        format="json",
    )
    c.post("/api/presence/heartbeat/", {"workspace_id": ws_id}, format="json")

    room = _client(scenario["owner"]).get(f"/api/presence/room/?workspace_id={ws_id}")
    bob = next(m for m in room.data if m["name"] == "Bob Dev")
    assert bob["avatar_config"]["hair"] == 3
