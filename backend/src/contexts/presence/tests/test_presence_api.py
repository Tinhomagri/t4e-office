"""Testes de API do Escritório Virtual: heartbeat, sala, status, avatar."""
import pytest
from rest_framework.test import APIClient

from contexts.identity.infrastructure.django.models import (
    MembershipModel,
    UserModel,
    WorkspaceModel,
)
from contexts.presence.infrastructure.django.models import (
    DeskAssignmentModel,
    PresenceModel,
    UserAvatarModel,
)
from contexts.projects.infrastructure.django.models import (
    CardModel,
    ProjectModel,
    WorkflowStatusModel,
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


def test_card_em_andamento_com_mesa_aparece_sentado_sem_heartbeat(scenario):
    ws = scenario["ws"]
    other = scenario["other"]
    UserAvatarModel.objects.create(user=other, config={"name": "Bob", "hair": 3})
    DeskAssignmentModel.objects.create(
        workspace=ws, floor=1, seat_id="ws-9-4", user=other
    )
    project = ProjectModel.objects.create(workspace=ws, name="Produto", key="PROD")
    WorkflowStatusModel.objects.create(
        project=project, name="Em andamento", slug="doing",
        category="in_progress", order=1, is_working=True,
    )
    CardModel.objects.create(
        project=project, number=1, title="Em andamento", assignee=other, status="doing"
    )

    room = _client(scenario["owner"]).get(f"/api/presence/room/?workspace_id={ws.id}&floor=1")

    assert room.status_code == 200
    assert room.data == [
        {
            "user_id": str(other.id),
            "name": "Bob Dev",
            "x": 0.5,
            "y": 0.5,
            "facing": "up",
            "floor": 1,
            "status": "focus",
            "seat_id": "ws-9-4",
            "avatar_config": {"name": "Bob", "hair": 3},
        }
    ]


def test_heartbeat_grava_o_andar(scenario):
    ws_id = str(scenario["ws"].id)
    c = _client(scenario["owner"])

    r = c.post(
        "/api/presence/heartbeat/",
        {"workspace_id": ws_id, "x": 0.4, "y": 0.6, "floor": 3},
        format="json",
    )
    assert r.status_code == 200
    presence = PresenceModel.objects.get(workspace_id=ws_id, user_id=scenario["owner"].id)
    assert presence.floor == 3


def test_heartbeat_sem_andar_assume_o_primeiro(scenario):
    ws_id = str(scenario["ws"].id)
    c = _client(scenario["owner"])
    c.post("/api/presence/heartbeat/", {"workspace_id": ws_id}, format="json")
    presence = PresenceModel.objects.get(workspace_id=ws_id, user_id=scenario["owner"].id)
    assert presence.floor == 1


def test_heartbeat_recusa_andar_absurdo(scenario):
    ws_id = str(scenario["ws"].id)
    c = _client(scenario["owner"])
    c.post(
        "/api/presence/heartbeat/",
        {"workspace_id": ws_id, "floor": 999},
        format="json",
    )
    # Fora da faixa cai no andar 1 em vez de gravar lixo.
    presence = PresenceModel.objects.get(workspace_id=ws_id, user_id=scenario["owner"].id)
    assert presence.floor == 1


def test_sala_nao_mistura_andares(scenario):
    ws_id = str(scenario["ws"].id)
    owner = scenario["owner"]
    other = scenario["other"]
    c = _client(owner)

    c.post(
        "/api/presence/heartbeat/",
        {"workspace_id": ws_id, "floor": 1},
        format="json",
    )
    PresenceModel.objects.create(workspace_id=ws_id, user_id=other.id, floor=2)

    andar1 = c.get("/api/presence/room/", {"workspace_id": ws_id, "floor": 1})
    assert [r["floor"] for r in andar1.data] == [1]
    assert str(other.id) not in [r["user_id"] for r in andar1.data]

    andar2 = c.get("/api/presence/room/", {"workspace_id": ws_id, "floor": 2})
    assert [r["user_id"] for r in andar2.data] == [str(other.id)]
    assert andar2.data[0]["floor"] == 2


def test_delivery_champion_ranqueia_por_pontos_nao_por_quantidade(scenario):
    """Quem entregou 1 card de 8 pontos tem que ganhar de quem entregou 3
    cards sem pontuação — o destaque é por pontuação, não por unidade."""
    ws_id = str(scenario["ws"].id)
    owner = scenario["owner"]
    other = scenario["other"]
    proj = ProjectModel.objects.create(workspace_id=ws_id, name="Proj", key="PRJ")

    # Bob: 3 cards entregues, sem pontuação (soma 0).
    for i in range(1, 4):
        CardModel.objects.create(
            project=proj, number=i, title=f"C{i}", assignee=other,
            status="done", resolution="done",
        )
    # Ana: 1 card só, mas vale 8 pontos — tem que vencer no ranking por pontos.
    CardModel.objects.create(
        project=proj, number=10, title="Grande entrega", assignee=owner,
        status="done", resolution="done", points=8,
    )

    r = _client(owner).get("/api/presence/delivery-champion/", {"workspace_id": ws_id})
    assert r.status_code == 200
    assert r.data["user_id"] == str(owner.id)
    assert r.data["deliveries"] == 8
