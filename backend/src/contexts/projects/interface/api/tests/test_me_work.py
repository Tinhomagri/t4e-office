"""Testes de /api/me/work/ (tela Meu Dia)."""
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
    WorkflowStatusModel,
)


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
    return {"owner": owner, "project": project, "client": client}


def test_is_working_reflete_a_coluna_configurada_nao_o_slug_doing(scenario):
    """Coluna renomeada pra algo diferente de "doing" mas marcada como
    is_working=True precisa contar como card em andamento no Meu Dia — antes
    o front comparava status contra o literal "doing" e ficava zerado pra
    qualquer board com coluna renomeada."""
    project = scenario["project"]
    owner = scenario["owner"]
    WorkflowStatusModel.objects.create(
        project=project, name="Em andamento", slug="em-andamento",
        category="in_progress", order=0, is_working=True,
    )
    WorkflowStatusModel.objects.create(
        project=project, name="Testes", slug="testes", category="in_progress", order=1,
    )
    card_andamento = CardModel.objects.create(
        project=project, number=1, title="Card em andamento", status="em-andamento",
        assignee=owner,
    )
    card_testes = CardModel.objects.create(
        project=project, number=2, title="Card em testes", status="testes",
        assignee=owner,
    )

    resp = scenario["client"].get("/api/me/work/")
    assert resp.status_code == 200
    por_id = {c["id"]: c for c in resp.data["cards"]}
    assert por_id[str(card_andamento.id)]["is_working"] is True
    assert por_id[str(card_testes.id)]["is_working"] is False
