"""Relator do card sem EDIT_ISSUE (o cliente que registrou o chamado) pode
corrigir o que ele mesmo escreveu — título, descrição, labels e prioridade —
mas não mexe no fluxo do time (status, responsável, sprint, pontos)."""
import pytest
from rest_framework.test import APIClient

from contexts.identity.infrastructure.django.models import (
    MembershipModel,
    UserModel,
    WorkspaceModel,
)
from contexts.projects.infrastructure.django.models import (
    CardModel,
    ProjectModel,
    ProjectRoleMemberModel,
    ProjectRoleModel,
    WorkflowStatusModel,
)


@pytest.fixture
def scenario(db):
    owner = UserModel.objects.create_user(
        email="owner@t4e.com", password="x", full_name="Owner", is_active=True
    )
    cliente = UserModel.objects.create_user(
        email="cliente@t4e.com", password="x", full_name="Cliente", is_active=True
    )
    outro = UserModel.objects.create_user(
        email="outro@t4e.com", password="x", full_name="Outro", is_active=True
    )
    ws = WorkspaceModel.objects.create(name="WS", slug="ws", owner=owner)
    MembershipModel.objects.create(workspace=ws, user=owner, role="owner")
    MembershipModel.objects.create(workspace=ws, user=cliente, role="member")
    MembershipModel.objects.create(workspace=ws, user=outro, role="member")
    project = ProjectModel.objects.create(
        workspace=ws, name="Proj", key="PRJ", visibility="workspace"
    )
    WorkflowStatusModel.objects.create(
        project=project, slug="backlog", name="Backlog", order=0,
        is_default=True, category="todo",
    )
    WorkflowStatusModel.objects.create(
        project=project, slug="feito", name="Feito", order=1,
        is_done=True, category="done",
    )
    # Papel viewer explícito: é assim que o cliente entra no board — enxerga e
    # comenta, sem EDIT_ISSUE.
    viewer = ProjectRoleModel.objects.create(
        project=project, slug="viewer", name="Visualizador"
    )
    ProjectRoleMemberModel.objects.create(role=viewer, user_id=cliente.id)
    ProjectRoleMemberModel.objects.create(role=viewer, user_id=outro.id)
    card = CardModel.objects.create(
        project=project, number=1, title="Pedido", status="backlog",
        reporter=cliente,
    )
    return {
        "project": project, "card": card,
        "cliente": cliente, "outro": outro, "owner": owner,
    }


def _client(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def test_relator_edita_titulo_e_descricao_do_proprio_card(scenario):
    resp = _client(scenario["cliente"]).patch(
        f"/api/cards/{scenario['card'].id}/",
        {"title": "Pedido corrigido", "description": "detalhes", "priority": "high"},
        format="json",
    )
    assert resp.status_code == 200, resp.data
    scenario["card"].refresh_from_db()
    assert scenario["card"].title == "Pedido corrigido"
    assert scenario["card"].priority == "high"


def test_relator_nao_move_card_de_coluna(scenario):
    resp = _client(scenario["cliente"]).patch(
        f"/api/cards/{scenario['card'].id}/", {"status": "feito"}, format="json"
    )
    assert resp.status_code == 403
    scenario["card"].refresh_from_db()
    assert scenario["card"].status == "backlog"


def test_relator_nao_burla_mandando_campo_liberado_junto_do_bloqueado(scenario):
    resp = _client(scenario["cliente"]).patch(
        f"/api/cards/{scenario['card'].id}/",
        {"title": "x", "assignee_id": str(scenario["outro"].id)},
        format="json",
    )
    assert resp.status_code == 403
    scenario["card"].refresh_from_db()
    assert scenario["card"].title == "Pedido"


def test_nao_relator_sem_edit_issue_continua_barrado(scenario):
    resp = _client(scenario["outro"]).patch(
        f"/api/cards/{scenario['card'].id}/", {"title": "x"}, format="json"
    )
    assert resp.status_code == 403


def test_quem_tem_edit_issue_edita_tudo(scenario):
    resp = _client(scenario["owner"]).patch(
        f"/api/cards/{scenario['card'].id}/", {"status": "feito"}, format="json"
    )
    assert resp.status_code == 200, resp.data
