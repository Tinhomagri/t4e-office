"""Testes do caso de uso de atribuição de mesa."""
import pytest

from contexts.identity.infrastructure.django.models import (
    MembershipModel,
    UserModel,
    WorkspaceModel,
)
from contexts.presence.application.assign_desk import (
    assign_desk,
    list_desk_assignments,
)


@pytest.fixture
def scenario(db):
    owner = UserModel.objects.create_user(
        email="owner@t4e.com", password="x", full_name="Ana Owner", is_active=True
    )
    other = UserModel.objects.create_user(
        email="bob@t4e.com", password="x", full_name="Bob Dev", is_active=True
    )
    ws = WorkspaceModel.objects.create(name="WS", slug="ws", owner=owner)
    MembershipModel.objects.create(workspace=ws, user=owner, role="owner")
    MembershipModel.objects.create(workspace=ws, user=other, role="member")
    return {"owner": owner, "other": other, "ws": ws}


def test_atribui_mesa_livre(scenario):
    assign_desk(
        workspace_id=str(scenario["ws"].id),
        floor=1,
        seat_id="ws-9-4",
        user_id=str(scenario["owner"].id),
    )
    rows = list_desk_assignments(workspace_id=str(scenario["ws"].id), floor=1)
    assert len(rows) == 1
    assert rows[0].seat_id == "ws-9-4"
    assert rows[0].user_id == scenario["owner"].id


def test_atribuir_mesa_nova_libera_a_antiga(scenario):
    ws_id = str(scenario["ws"].id)
    user_id = str(scenario["owner"].id)
    assign_desk(workspace_id=ws_id, floor=1, seat_id="ws-9-4", user_id=user_id)
    assign_desk(workspace_id=ws_id, floor=1, seat_id="ws-10-4", user_id=user_id)

    rows = list_desk_assignments(workspace_id=ws_id, floor=1)
    assert len(rows) == 1
    assert rows[0].seat_id == "ws-10-4"


def test_reatribuir_a_mesma_mesa_pra_outra_pessoa_substitui(scenario):
    ws_id = str(scenario["ws"].id)
    assign_desk(
        workspace_id=ws_id, floor=1, seat_id="ws-9-4", user_id=str(scenario["owner"].id)
    )
    assign_desk(
        workspace_id=ws_id, floor=1, seat_id="ws-9-4", user_id=str(scenario["other"].id)
    )
    rows = list_desk_assignments(workspace_id=ws_id, floor=1)
    assert len(rows) == 1
    assert rows[0].user_id == scenario["other"].id


def test_user_id_none_desatribui(scenario):
    ws_id = str(scenario["ws"].id)
    assign_desk(
        workspace_id=ws_id, floor=1, seat_id="ws-9-4", user_id=str(scenario["owner"].id)
    )
    assign_desk(workspace_id=ws_id, floor=1, seat_id="ws-9-4", user_id=None)
    assert list_desk_assignments(workspace_id=ws_id, floor=1) == []


def test_list_ignora_atribuicao_de_quem_saiu_do_workspace(scenario):
    """Remover o membro (aqui, direto a MembershipModel) some com a mesa dele
    da listagem — sem isso o nome ficaria pra sempre como plaquinha flutuante
    sobre a mesa antiga."""
    ws_id = str(scenario["ws"].id)
    assign_desk(
        workspace_id=ws_id, floor=1, seat_id="ws-9-4", user_id=str(scenario["other"].id)
    )
    assert len(list_desk_assignments(workspace_id=ws_id, floor=1)) == 1

    MembershipModel.objects.filter(
        workspace_id=ws_id, user_id=scenario["other"].id
    ).delete()

    assert list_desk_assignments(workspace_id=ws_id, floor=1) == []


def test_list_ignora_outro_andar(scenario):
    ws_id = str(scenario["ws"].id)
    assign_desk(
        workspace_id=ws_id, floor=1, seat_id="ws-9-4", user_id=str(scenario["owner"].id)
    )
    assert list_desk_assignments(workspace_id=ws_id, floor=2) == []
