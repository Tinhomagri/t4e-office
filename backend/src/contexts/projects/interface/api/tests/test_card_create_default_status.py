"""Criação de card sem "status" explícito usa a coluna default do projeto,
não o literal "todo" — projetos com slugs customizados (ex.: "a-fazer")
ficavam com cards órfãos, que somem do quadro por não bater com nenhuma
coluna real (bug achado testando o MCP remoto em produção)."""
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
    project = ProjectModel.objects.create(
        workspace=ws, name="Proj", key="PRJ", visibility="workspace"
    )
    WorkflowStatusModel.objects.create(
        project=project, slug="a-fazer", name="A fazer", order=0,
        is_default=True, category="todo",
    )
    WorkflowStatusModel.objects.create(
        project=project, slug="concluído", name="Concluído", order=1,
        is_default=False, category="done",
    )
    client = APIClient()
    client.force_authenticate(user=owner)
    return {"owner": owner, "project": project, "client": client}


def test_status_omitido_usa_coluna_default_do_projeto(scenario):
    resp = scenario["client"].post(
        f"/api/projects/{scenario['project'].id}/cards/",
        {"title": "Card via MCP"},
        format="json",
    )
    assert resp.status_code == 201
    card = CardModel.objects.get(id=resp.data["id"])
    assert card.status == "a-fazer"


def test_status_explicito_e_respeitado_mesmo_nao_sendo_o_default(scenario):
    resp = scenario["client"].post(
        f"/api/projects/{scenario['project'].id}/cards/",
        {"title": "Card concluído direto", "status": "concluído"},
        format="json",
    )
    assert resp.status_code == 201
    card = CardModel.objects.get(id=resp.data["id"])
    assert card.status == "concluído"


@pytest.fixture
def scenario_sem_default(db):
    """Projeto cujas colunas foram criadas manualmente — nenhuma marcada
    is_default=True (caso real achado em produção: `WorkflowStatusModel`
    listava 3 colunas, todas com is_default=False)."""
    owner = UserModel.objects.create_user(
        email="owner2@t4e.com", password="x", full_name="Owner2", is_active=True
    )
    ws = WorkspaceModel.objects.create(name="WS2", slug="ws2", owner=owner)
    MembershipModel.objects.create(workspace=ws, user=owner, role="owner")
    project = ProjectModel.objects.create(
        workspace=ws, name="Proj2", key="PRJ2", visibility="workspace"
    )
    WorkflowStatusModel.objects.create(
        project=project, slug="pendentes", name="Itens Pendentes", order=0,
        is_default=False, category="todo",
    )
    WorkflowStatusModel.objects.create(
        project=project, slug="em-andamento", name="Em andamento", order=1,
        is_default=False, category="doing",
    )
    client = APIClient()
    client.force_authenticate(user=owner)
    return {"owner": owner, "project": project, "client": client}


def test_status_omitido_sem_nenhuma_coluna_default_usa_a_primeira_por_ordem(scenario_sem_default):
    resp = scenario_sem_default["client"].post(
        f"/api/projects/{scenario_sem_default['project'].id}/cards/",
        {"title": "Card via MCP"},
        format="json",
    )
    assert resp.status_code == 201
    card = CardModel.objects.get(id=resp.data["id"])
    assert card.status == "pendentes"
