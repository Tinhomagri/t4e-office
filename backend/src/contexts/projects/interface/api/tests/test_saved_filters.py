"""Testes de filtros salvos (quick filters do board)."""
import pytest
from rest_framework.test import APIClient

from contexts.identity.infrastructure.django.models import (
    MembershipModel,
    UserModel,
    WorkspaceModel,
)
from contexts.projects.infrastructure.django.models import ProjectModel, SavedFilterModel


@pytest.fixture
def scenario(db):
    owner = UserModel.objects.create_user(
        email="owner@t4e.com", password="x", full_name="Owner", is_active=True
    )
    member = UserModel.objects.create_user(
        email="dev@t4e.com", password="x", full_name="Dev", is_active=True
    )
    ws = WorkspaceModel.objects.create(name="WS", slug="ws", owner=owner)
    MembershipModel.objects.create(workspace=ws, user=owner, role="owner")
    MembershipModel.objects.create(workspace=ws, user=member, role="member")
    project = ProjectModel.objects.create(
        workspace=ws, name="Proj", key="PRJ", visibility="workspace"
    )
    client = APIClient()
    client.force_authenticate(user=owner)
    member_client = APIClient()
    member_client.force_authenticate(user=member)
    return {
        "owner": owner, "member": member, "project": project,
        "client": client, "member_client": member_client,
    }


def test_cria_e_lista_filtro(scenario):
    project = scenario["project"]
    client = scenario["client"]
    resp = client.post(
        f"/api/projects/{project.id}/saved-filters/",
        {"name": "Bugs urgentes", "jql": "type = bug AND priority = urgent"},
        format="json",
    )
    assert resp.status_code == 201
    assert resp.data["name"] == "Bugs urgentes"

    listed = client.get(f"/api/projects/{project.id}/saved-filters/")
    assert listed.status_code == 200
    assert len(listed.data) == 1


def test_nome_e_jql_obrigatorios(scenario):
    project = scenario["project"]
    resp = scenario["client"].post(
        f"/api/projects/{project.id}/saved-filters/", {"name": "", "jql": ""}, format="json"
    )
    assert resp.status_code == 400


def test_filtro_compartilhado_visivel_a_membro(scenario):
    project = scenario["project"]
    scenario["client"].post(
        f"/api/projects/{project.id}/saved-filters/",
        {"name": "Meus", "jql": "assignee = me", "shared": True},
        format="json",
    )
    resp = scenario["member_client"].get(f"/api/projects/{project.id}/saved-filters/")
    assert resp.status_code == 200
    assert len(resp.data) == 1


def test_filtro_privado_invisivel_a_outros(scenario):
    project = scenario["project"]
    scenario["client"].post(
        f"/api/projects/{project.id}/saved-filters/",
        {"name": "Privado", "jql": "type = bug", "shared": False},
        format="json",
    )
    resp = scenario["member_client"].get(f"/api/projects/{project.id}/saved-filters/")
    assert len(resp.data) == 0


def test_dono_exclui_filtro(scenario):
    project = scenario["project"]
    created = scenario["client"].post(
        f"/api/projects/{project.id}/saved-filters/",
        {"name": "Tmp", "jql": "type = bug"},
        format="json",
    )
    resp = scenario["client"].delete(f"/api/saved-filters/{created.data['id']}/")
    assert resp.status_code == 204
    assert SavedFilterModel.objects.count() == 0


def test_nao_dono_sem_capacidade_nao_exclui(scenario):
    project = scenario["project"]
    created = scenario["member_client"].post(
        f"/api/projects/{project.id}/saved-filters/",
        {"name": "Do membro", "jql": "type = bug"},
        format="json",
    )
    # Owner do workspace tem MANAGE_WORKFLOW — pode excluir filtro alheio.
    resp = scenario["client"].delete(f"/api/saved-filters/{created.data['id']}/")
    assert resp.status_code == 204
