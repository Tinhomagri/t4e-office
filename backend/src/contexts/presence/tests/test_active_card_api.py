"""Testes de API do balão de card ativo: permissão de leitura (owner/admin) e
de escrita da observação (só o assignee)."""
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
    WorkflowStatusModel,
)


@pytest.fixture
def scenario(db):
    owner = UserModel.objects.create_user(
        email="owner@t4e.com", password="x", full_name="Ana Owner", is_active=True
    )
    dev = UserModel.objects.create_user(
        email="bob@t4e.com", password="x", full_name="Bob Dev", is_active=True
    )
    outsider = UserModel.objects.create_user(
        email="out@t4e.com", password="x", full_name="Zé Fora", is_active=True
    )
    ws = WorkspaceModel.objects.create(name="WS", slug="ws", owner=owner)
    MembershipModel.objects.create(workspace=ws, user=owner, role="owner")
    MembershipModel.objects.create(workspace=ws, user=dev, role="member")
    project = ProjectModel.objects.create(workspace=ws, name="Mia", key="MIA")
    WorkflowStatusModel.objects.create(
        project=project, name="Em andamento", slug="doing",
        category="in_progress", order=1, is_working=True,
    )
    card = CardModel.objects.create(
        project=project, number=1, title="Card ativo", assignee=dev, status="doing"
    )
    CardHistoryModel.objects.create(
        card=card, author=dev, field="status", old_value="todo", new_value="doing"
    )
    return {"owner": owner, "dev": dev, "outsider": outsider, "ws": ws, "card": card}


def _client(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


def test_owner_ve_card_ativo_de_membro(scenario):
    c = _client(scenario["owner"])
    r = c.get(
        f"/api/presence/active-card/?workspace_id={scenario['ws'].id}&user_id={scenario['dev'].id}"
    )
    assert r.status_code == 200
    assert r.data["active"] is True
    assert r.data["cards"][0]["title"] == "Card ativo"
    assert r.data["cards"][0]["project"] == "MIA"
    assert "doing_since" in r.data["cards"][0]


def test_member_comum_nao_pode_ver_card_de_outro(scenario):
    c = _client(scenario["dev"])
    r = c.get(
        f"/api/presence/active-card/?workspace_id={scenario['ws'].id}&user_id={scenario['owner'].id}"
    )
    assert r.status_code == 403


def test_member_comum_ve_o_proprio_card(scenario):
    """A app "Meu Card" é habilitada pra todo mundo: um member comum tem que
    conseguir ler o PRÓPRIO card ativo (200, não 403)."""
    c = _client(scenario["dev"])
    r = c.get(
        f"/api/presence/active-card/?workspace_id={scenario['ws'].id}&user_id={scenario['dev'].id}"
    )
    assert r.status_code == 200
    assert r.data["active"] is True
    assert r.data["cards"][0]["title"] == "Card ativo"


def test_outsider_sem_membership_nao_ve_o_proprio_card(scenario):
    """Sem membership nenhuma, nem o próprio card sai (min_role=member já
    barra: quem não é membro não passa)."""
    c = _client(scenario["outsider"])
    r = c.get(
        f"/api/presence/active-card/?workspace_id={scenario['ws'].id}&user_id={scenario['outsider'].id}"
    )
    assert r.status_code == 403


def test_workspace_id_invalido_da_400(scenario):
    c = _client(scenario["owner"])
    r = c.get(
        f"/api/presence/active-card/?workspace_id=not-a-uuid&user_id={scenario['dev'].id}"
    )
    assert r.status_code == 400


def test_outsider_sem_membership_nao_ve_nada(scenario):
    c = _client(scenario["outsider"])
    r = c.get(
        f"/api/presence/active-card/?workspace_id={scenario['ws'].id}&user_id={scenario['dev'].id}"
    )
    assert r.status_code == 403


def test_user_id_invalido_da_400(scenario):
    c = _client(scenario["owner"])
    r = c.get(
        f"/api/presence/active-card/?workspace_id={scenario['ws'].id}&user_id=not-a-uuid"
    )
    assert r.status_code == 400


def test_sem_card_doing_retorna_active_false(scenario):
    scenario["card"].status = "done"
    scenario["card"].save(update_fields=["status"])
    c = _client(scenario["owner"])
    r = c.get(
        f"/api/presence/active-card/?workspace_id={scenario['ws'].id}&user_id={scenario['dev'].id}"
    )
    assert r.status_code == 200
    assert r.data == {"active": False}


def test_assignee_pode_editar_observacao(scenario):
    c = _client(scenario["dev"])
    r = c.patch(
        "/api/presence/active-card/note/",
        {"card_id": str(scenario["card"].id), "note": "quase lá"},
        format="json",
    )
    assert r.status_code == 200
    scenario["card"].refresh_from_db()
    assert scenario["card"].working_note == "quase lá"


def test_nao_assignee_nao_pode_editar_observacao(scenario):
    c = _client(scenario["owner"])
    r = c.patch(
        "/api/presence/active-card/note/",
        {"card_id": str(scenario["card"].id), "note": "hackeado"},
        format="json",
    )
    assert r.status_code == 403


def test_card_id_invalido_da_400(scenario):
    c = _client(scenario["dev"])
    r = c.patch(
        "/api/presence/active-card/note/",
        {"card_id": "not-a-uuid", "note": "x"},
        format="json",
    )
    assert r.status_code == 400


def test_observacao_longa_demais_da_400(scenario):
    c = _client(scenario["dev"])
    r = c.patch(
        "/api/presence/active-card/note/",
        {"card_id": str(scenario["card"].id), "note": "x" * 501},
        format="json",
    )
    assert r.status_code == 400
    scenario["card"].refresh_from_db()
    assert scenario["card"].working_note == ""


def test_observacao_no_limite_passa(scenario):
    c = _client(scenario["dev"])
    r = c.patch(
        "/api/presence/active-card/note/",
        {"card_id": str(scenario["card"].id), "note": "x" * 500},
        format="json",
    )
    assert r.status_code == 200
    scenario["card"].refresh_from_db()
    assert scenario["card"].working_note == "x" * 500


def test_card_ativo_de_outro_workspace_nao_aparece_na_api(scenario):
    """Dev é membro dos workspaces A (scenario['ws']) e B. Ele NÃO tem card
    ativo em A (o card padrão do fixture é marcado como 'done'), mas tem um
    card 'doing' em B. Owner de A consulta a API passando workspace_id=A e
    user_id=dev — não deve ver o card de B, mesmo que dev tenha um card
    ativo (só que em outro workspace)."""
    owner_a = scenario["owner"]
    dev = scenario["dev"]
    ws_a = scenario["ws"]
    scenario["card"].status = "done"
    scenario["card"].save(update_fields=["status"])

    owner_b = UserModel.objects.create_user(
        email="owner-b@t4e.com", password="x", full_name="Carla Owner B", is_active=True
    )
    ws_b = WorkspaceModel.objects.create(name="WS B", slug="ws-b", owner=owner_b)
    MembershipModel.objects.create(workspace=ws_b, user=owner_b, role="owner")
    MembershipModel.objects.create(workspace=ws_b, user=dev, role="member")
    project_b = ProjectModel.objects.create(workspace=ws_b, name="Nia", key="NIA")
    WorkflowStatusModel.objects.create(
        project=project_b, name="Em andamento", slug="doing",
        category="in_progress", order=1, is_working=True,
    )
    card_b = CardModel.objects.create(
        project=project_b, number=1, title="Card em B", assignee=dev, status="doing"
    )
    CardHistoryModel.objects.create(
        card=card_b, author=dev, field="status", old_value="todo", new_value="doing"
    )

    c = _client(owner_a)
    r = c.get(
        f"/api/presence/active-card/?workspace_id={ws_a.id}&user_id={dev.id}"
    )
    assert r.status_code == 200
    assert r.data == {"active": False}
