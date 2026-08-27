"""subtasks_done deve casar com o slug REAL de concluído do projeto, não com
o literal "done" — bug que zerava a contagem em qualquer board com coluna
concluída renomeada (import do Jira, workflow customizado etc.)."""
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
    # Coluna concluída com slug renomeado — não é "done".
    WorkflowStatusModel.objects.create(
        project=project, name="Concluído", slug="concluido", category="done", order=1
    )
    WorkflowStatusModel.objects.create(
        project=project, name="Pendente", slug="pendente", category="todo", order=0, is_default=True
    )
    parent = CardModel.objects.create(project=project, number=1, title="Pai", status="pendente")
    CardModel.objects.create(
        project=project, number=2, title="Sub 1", status="concluido", parent=parent
    )
    CardModel.objects.create(
        project=project, number=3, title="Sub 2", status="pendente", parent=parent
    )
    client = APIClient()
    client.force_authenticate(user=owner)
    return {"project": project, "parent": parent, "client": client}


def test_subtasks_done_usa_slug_real_de_concluido_do_projeto(scenario):
    resp = scenario["client"].get(f"/api/projects/{scenario['project'].id}/cards/")
    assert resp.status_code == 200
    parent_row = next(r for r in resp.json() if r["id"] == str(scenario["parent"].id))
    assert parent_row["subtasks_count"] == 2
    assert parent_row["subtasks_done"] == 1


def test_subtasks_done_e_zero_sem_bater_no_literal_done(scenario):
    """Nenhuma subtarefa usa o slug "done" — a contagem antiga (hardcoded)
    devolveria 0 mesmo com uma concluída de verdade."""
    resp = scenario["client"].get(f"/api/projects/{scenario['project'].id}/cards/")
    parent_row = next(r for r in resp.json() if r["id"] == str(scenario["parent"].id))
    assert parent_row["subtasks_done"] != 0
