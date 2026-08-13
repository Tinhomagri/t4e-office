"""Testes de documentos colaborativos do projeto (aba Documentos)."""
import pytest
from rest_framework.test import APIClient

from contexts.identity.infrastructure.django.models import (
    MembershipModel,
    UserModel,
    WorkspaceModel,
)
from contexts.projects.infrastructure.django.models import DocumentModel, ProjectModel


@pytest.fixture
def scenario(db):
    owner = UserModel.objects.create_user(
        email="owner@t4e.com", password="x", full_name="Owner", is_active=True
    )
    viewer = UserModel.objects.create_user(
        email="viewer@t4e.com", password="x", full_name="Viewer", is_active=True
    )
    outsider = UserModel.objects.create_user(
        email="out@t4e.com", password="x", full_name="Out", is_active=True
    )
    ws = WorkspaceModel.objects.create(name="WS", slug="ws", owner=owner)
    MembershipModel.objects.create(workspace=ws, user=owner, role="owner")
    MembershipModel.objects.create(workspace=ws, user=viewer, role="member")
    project = ProjectModel.objects.create(
        workspace=ws, name="Proj", key="PRJ", visibility="workspace"
    )

    client = APIClient()
    client.force_authenticate(user=owner)
    viewer_client = APIClient()
    viewer_client.force_authenticate(user=viewer)
    outsider_client = APIClient()
    outsider_client.force_authenticate(user=outsider)

    return {
        "owner": owner, "project": project,
        "client": client, "viewer_client": viewer_client, "outsider_client": outsider_client,
    }


def test_cria_documento_e_aparece_para_time(scenario):
    project = scenario["project"]
    resp = scenario["client"].post(
        f"/api/projects/{project.id}/documents/",
        {"title": "Spec v1", "content": "<h1>Olá</h1>"},
        format="json",
    )
    assert resp.status_code == 201
    assert resp.data["title"] == "Spec v1"
    doc_id = resp.data["id"]

    # Outro membro do mesmo workspace (developer via papel derivado) enxerga o doc.
    listed = scenario["viewer_client"].get(f"/api/projects/{project.id}/documents/")
    assert listed.status_code == 200
    assert len(listed.data) == 1
    assert "content" not in listed.data[0]  # lista não traz conteúdo pesado

    detail = scenario["viewer_client"].get(f"/api/documents/{doc_id}/")
    assert detail.status_code == 200
    assert detail.data["content"] == "<h1>Olá</h1>"


def test_fora_do_workspace_nao_acessa(scenario):
    project = scenario["project"]
    created = scenario["client"].post(
        f"/api/projects/{project.id}/documents/", {"title": "X", "content": ""}, format="json"
    )
    resp = scenario["outsider_client"].get(f"/api/documents/{created.data['id']}/")
    assert resp.status_code in (403, 404)


def test_atualiza_conteudo_e_marca_autor(scenario):
    project = scenario["project"]
    created = scenario["client"].post(
        f"/api/projects/{project.id}/documents/", {"title": "X", "content": "a"}, format="json"
    )
    resp = scenario["client"].patch(
        f"/api/documents/{created.data['id']}/", {"content": "<p>novo</p>"}, format="json"
    )
    assert resp.status_code == 200
    assert resp.data["content"] == "<p>novo</p>"
    assert resp.data["updated_by"] == str(scenario["owner"].id)


def test_exclui_documento(scenario):
    project = scenario["project"]
    created = scenario["client"].post(
        f"/api/projects/{project.id}/documents/", {"title": "X", "content": ""}, format="json"
    )
    resp = scenario["client"].delete(f"/api/documents/{created.data['id']}/")
    assert resp.status_code == 204
    assert DocumentModel.objects.count() == 0
