"""Status do projeto e ids do Manager (cliente/contrato) — consumidos pela API
de agentes; editáveis pelo PATCH normal do projeto."""
import pytest
from rest_framework.test import APIClient

from contexts.identity.infrastructure.django.models import (
    MembershipModel,
    UserModel,
    WorkspaceModel,
)
from contexts.projects.infrastructure.django.models import ProjectModel


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
    return {"project": project, "client": client}


def test_patch_status_e_ids_do_manager(scenario):
    p = scenario["project"]
    resp = scenario["client"].patch(
        f"/api/projects/{p.id}/",
        {"status": "paused", "manager_client_id": "CLI-1", "manager_contract_id": "C-9"},
        format="json",
    )
    assert resp.status_code == 200
    body = scenario["client"].get(f"/api/projects/{p.id}/").json()
    assert (body["status"], body["manager_client_id"], body["manager_contract_id"]) == (
        "paused", "CLI-1", "C-9",
    )


def test_status_padrao_ativo_e_invalido_400(scenario):
    p = scenario["project"]
    assert scenario["client"].get(f"/api/projects/{p.id}/").json()["status"] == "active"
    resp = scenario["client"].patch(f"/api/projects/{p.id}/", {"status": "xpto"}, format="json")
    assert resp.status_code == 400


def test_updated_at_anda_no_save(scenario):
    p = scenario["project"]
    antes = ProjectModel.objects.get(pk=p.pk).updated_at
    scenario["client"].patch(f"/api/projects/{p.id}/", {"status": "closed"}, format="json")
    assert ProjectModel.objects.get(pk=p.pk).updated_at > antes
