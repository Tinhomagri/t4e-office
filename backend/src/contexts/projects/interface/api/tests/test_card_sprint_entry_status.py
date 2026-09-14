"""Card no Backlog (coluna is_default) que entra numa sprint deve pular
automaticamente para a coluna "Pendente" (is_sprint_entry) do projeto —
sem isso o card fica preso no Backlog mesmo já estando na sprint ativa."""
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
    SprintModel,
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
        project=project, slug="backlog", name="Backlog", order=0,
        is_default=True, category="todo",
    )
    WorkflowStatusModel.objects.create(
        project=project, slug="pendente", name="Pendente", order=1,
        is_sprint_entry=True, category="todo",
    )
    WorkflowStatusModel.objects.create(
        project=project, slug="em-andamento", name="Em andamento", order=2,
        category="in_progress",
    )
    sprint = SprintModel.objects.create(project=project, name="Sprint 1")
    client = APIClient()
    client.force_authenticate(user=owner)
    return {"owner": owner, "project": project, "sprint": sprint, "client": client}


def _create_card(scenario, *, status="backlog"):
    resp = scenario["client"].post(
        f"/api/projects/{scenario['project'].id}/cards/",
        {"title": "Card", "status": status},
        format="json",
    )
    assert resp.status_code == 201
    return CardModel.objects.get(id=resp.data["id"])


def test_card_no_backlog_pula_para_pendente_ao_entrar_na_sprint(scenario):
    card = _create_card(scenario, status="backlog")

    resp = scenario["client"].patch(
        f"/api/cards/{card.id}/",
        {"sprint_id": str(scenario["sprint"].id)},
        format="json",
    )

    assert resp.status_code == 200
    card.refresh_from_db()
    assert card.status == "pendente"


def test_card_fora_do_backlog_nao_muda_status_ao_entrar_na_sprint(scenario):
    card = _create_card(scenario, status="em-andamento")

    resp = scenario["client"].patch(
        f"/api/cards/{card.id}/",
        {"sprint_id": str(scenario["sprint"].id)},
        format="json",
    )

    assert resp.status_code == 200
    card.refresh_from_db()
    assert card.status == "em-andamento"


def test_status_explicito_junto_com_sprint_id_e_respeitado(scenario):
    card = _create_card(scenario, status="backlog")

    resp = scenario["client"].patch(
        f"/api/cards/{card.id}/",
        {"sprint_id": str(scenario["sprint"].id), "status": "em-andamento"},
        format="json",
    )

    assert resp.status_code == 200
    card.refresh_from_db()
    assert card.status == "em-andamento"
