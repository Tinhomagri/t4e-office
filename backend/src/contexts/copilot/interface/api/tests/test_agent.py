"""Testes do Copiloto agêntico: leitura do board e execução das ações confirmadas."""
import pytest
from rest_framework.test import APIClient

from contexts.copilot.infrastructure.agent.registry import AgentTools
from contexts.identity.infrastructure.django.models import (
    MembershipModel,
    UserModel,
    WorkspaceModel,
)
from contexts.projects.infrastructure.django.models import CardModel, ProjectModel


@pytest.fixture
def scenario(db):
    owner = UserModel.objects.create_user(
        email="owner@t4e.com", password="x", full_name="Owner", is_active=True
    )
    ws = WorkspaceModel.objects.create(name="WS", slug="ws", owner=owner)
    MembershipModel.objects.create(workspace=ws, user=owner, role="owner")
    project = ProjectModel.objects.create(workspace=ws, name="Proj", key="PRJ")
    client = APIClient()
    client.force_authenticate(user=owner)
    return {"owner": owner, "ws": ws, "project": project, "client": client}


def test_read_list_projects_e_board_summary(scenario):
    tools = AgentTools(
        workspace_id=str(scenario["ws"].id), actor_id=str(scenario["owner"].id)
    )
    projects = tools.execute_read("list_projects", {})
    assert projects["projects"][0]["key"] == "PRJ"

    summary = tools.execute_read(
        "board_summary", {"project_id": str(scenario["project"].id)}
    )
    assert summary["total_cards"] == 0
    assert summary["active_sprint"] is None


def test_execute_cria_card_via_endpoint(scenario):
    resp = scenario["client"].post(
        "/api/copilot/agent/execute/",
        {
            "workspace_id": str(scenario["ws"].id),
            "actions": [
                {
                    "action": "create_card",
                    "reason": "Tarefa extraída da reunião.",
                    "project_id": str(scenario["project"].id),
                    "title": "Implementar login SSO",
                    "priority": "high",
                    "type": "feature",
                }
            ],
        },
        format="json",
    )
    assert resp.status_code == 200
    result = resp.json()["results"][0]
    assert result["ok"] is True
    assert result["ref"] == "PRJ-1"
    card = CardModel.objects.get(id=result["id"])
    assert card.title == "Implementar login SSO"
    assert card.source == "copilot"


def test_execute_cria_card_por_chave_do_projeto(scenario):
    """A IA costuma passar a chave ('PRJ') em vez do UUID — deve funcionar."""
    resp = scenario["client"].post(
        "/api/copilot/agent/execute/",
        {
            "workspace_id": str(scenario["ws"].id),
            "actions": [
                {
                    "action": "create_card",
                    "reason": "por chave",
                    "project_id": "PRJ",
                    "title": "Card via chave",
                }
            ],
        },
        format="json",
    )
    assert resp.status_code == 200
    result = resp.json()["results"][0]
    assert result["ok"] is True
    assert result["ref"] == "PRJ-1"
    assert CardModel.objects.filter(title="Card via chave").exists()


def test_execute_cria_card_pelo_nome_do_projeto(scenario):
    """Projeto nome 'AAAA' com chave 'AAAAA' — IA pode passar o nome."""
    ProjectModel.objects.create(workspace=scenario["ws"], name="AAAA", key="AAAAA")
    resp = scenario["client"].post(
        "/api/copilot/agent/execute/",
        {
            "workspace_id": str(scenario["ws"].id),
            "actions": [
                {
                    "action": "create_card",
                    "reason": "pelo nome",
                    "project_id": "AAAA",
                    "title": "Card pelo nome",
                }
            ],
        },
        format="json",
    )
    assert resp.status_code == 200
    result = resp.json()["results"][0]
    assert result["ok"] is True, result
    assert result["ref"] == "AAAAA-1"


def test_create_card_nunca_fica_em_backlog(scenario):
    """Card criado pela IA deve entrar em 'todo' (visível no Quadro), não backlog."""
    tools = AgentTools(
        workspace_id=str(scenario["ws"].id), actor_id=str(scenario["owner"].id)
    )
    res = tools.execute_write(
        {
            "action": "create_card",
            "reason": "x",
            "project_id": "PRJ",
            "title": "Deve ir pro quadro",
            "status": "backlog",
        }
    )
    assert res["ok"] is True
    assert res["status"] == "todo"
    card = CardModel.objects.get(id=res["id"])
    assert card.status == "todo"


def test_feedback_e_metrics(scenario):
    ws = str(scenario["ws"].id)
    client = scenario["client"]

    assert client.post(
        "/api/copilot/feedback/", {"workspace_id": ws, "rating": "up"}, format="json"
    ).status_code == 201
    client.post(
        "/api/copilot/feedback/", {"workspace_id": ws, "rating": "down"}, format="json"
    )

    resp = client.get(f"/api/copilot/metrics/?workspace_id={ws}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["thumbs_up"] == 1
    assert data["thumbs_down"] == 1
    assert data["satisfaction"] == 50


def test_relatorio_e_config_de_ia_sao_restritos_a_admin_owner(scenario):
    """Membro comum não pode ver o relatório do Copiloto nem a config de IA —
    só admin/owner. Métricas de uso e a chave conectada não são um dado de
    leitura livre pra qualquer membro."""
    ws = scenario["ws"]
    member = UserModel.objects.create_user(
        email="member@t4e.com", password="x", full_name="Member", is_active=True
    )
    MembershipModel.objects.create(workspace=ws, user=member, role="member")
    member_client = APIClient()
    member_client.force_authenticate(user=member)

    assert (
        member_client.get(f"/api/copilot/metrics/?workspace_id={ws.id}").status_code
        == 403
    )
    assert (
        member_client.get(f"/api/copilot/ai-config/?workspace_id={ws.id}").status_code
        == 403
    )

    # Owner continua acessando os dois normalmente.
    owner_client = scenario["client"]
    assert (
        owner_client.get(f"/api/copilot/metrics/?workspace_id={ws.id}").status_code
        == 200
    )
    assert (
        owner_client.get(f"/api/copilot/ai-config/?workspace_id={ws.id}").status_code
        == 200
    )


def test_execute_bloqueia_projeto_de_outro_workspace(scenario):
    other_owner = UserModel.objects.create_user(
        email="x@t4e.com", password="x", full_name="X", is_active=True
    )
    other_ws = WorkspaceModel.objects.create(name="W2", slug="w2", owner=other_owner)
    other_proj = ProjectModel.objects.create(workspace=other_ws, name="P2", key="OTH")

    resp = scenario["client"].post(
        "/api/copilot/agent/execute/",
        {
            "workspace_id": str(scenario["ws"].id),
            "actions": [
                {
                    "action": "create_card",
                    "reason": "tentativa",
                    "project_id": str(other_proj.id),
                    "title": "Não deve criar",
                }
            ],
        },
        format="json",
    )
    assert resp.status_code == 200
    result = resp.json()["results"][0]
    assert result["ok"] is False
    assert not CardModel.objects.filter(title="Não deve criar").exists()
