"""Testes do escopo por projeto dos documentos do Copiloto (POST/GET .../documents/)."""
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
    other_ws = WorkspaceModel.objects.create(name="Other WS", slug="other-ws", owner=owner)
    MembershipModel.objects.create(workspace=other_ws, user=owner, role="owner")

    project_a = ProjectModel.objects.create(workspace=ws, name="Projeto A", key="PA")
    project_b = ProjectModel.objects.create(workspace=ws, name="Projeto B", key="PB")
    project_other_ws = ProjectModel.objects.create(
        workspace=other_ws, name="Projeto de outro workspace", key="POW"
    )

    client = APIClient()
    client.force_authenticate(user=owner)
    return {
        "owner": owner,
        "workspace": ws,
        "other_workspace": other_ws,
        "project_a": project_a,
        "project_b": project_b,
        "project_other_ws": project_other_ws,
        "client": client,
    }


def test_post_com_project_id_persiste_documento_com_projeto(scenario):
    resp = scenario["client"].post(
        "/api/copilot/documents/",
        {
            "workspace_id": str(scenario["workspace"].id),
            "project_id": str(scenario["project_a"].id),
            "title": "Ata da reunião",
            "kind": "text",
            "text": "Conteúdo da ata.",
        },
        format="json",
    )
    assert resp.status_code == 201
    assert resp.data["project_id"] == str(scenario["project_a"].id)


def test_post_sem_project_id_continua_funcionando(scenario):
    resp = scenario["client"].post(
        "/api/copilot/documents/",
        {
            "workspace_id": str(scenario["workspace"].id),
            "title": "Ata sem projeto",
            "kind": "text",
            "text": "Conteúdo qualquer.",
        },
        format="json",
    )
    assert resp.status_code == 201
    assert resp.data["project_id"] is None


def test_post_com_project_id_de_outro_workspace_e_rejeitado(scenario):
    resp = scenario["client"].post(
        "/api/copilot/documents/",
        {
            "workspace_id": str(scenario["workspace"].id),
            "project_id": str(scenario["project_other_ws"].id),
            "title": "Ata inválida",
            "kind": "text",
            "text": "Conteúdo qualquer.",
        },
        format="json",
    )
    assert resp.status_code == 400


def test_get_lista_filtra_por_project_id(scenario):
    scenario["client"].post(
        "/api/copilot/documents/",
        {
            "workspace_id": str(scenario["workspace"].id),
            "project_id": str(scenario["project_a"].id),
            "title": "Doc do projeto A",
            "kind": "text",
            "text": "Texto A.",
        },
        format="json",
    )
    scenario["client"].post(
        "/api/copilot/documents/",
        {
            "workspace_id": str(scenario["workspace"].id),
            "title": "Doc sem projeto",
            "kind": "text",
            "text": "Texto B.",
        },
        format="json",
    )

    resp = scenario["client"].get(
        "/api/copilot/documents/",
        {
            "workspace_id": str(scenario["workspace"].id),
            "project_id": str(scenario["project_a"].id),
        },
    )
    assert resp.status_code == 200
    assert len(resp.data) == 1
    assert resp.data[0]["title"] == "Doc do projeto A"
    assert resp.data[0]["project_id"] == str(scenario["project_a"].id)


def test_get_detalhe_devolve_texto_integral(scenario):
    texto_longo = "a" * 500
    create_resp = scenario["client"].post(
        "/api/copilot/documents/",
        {
            "workspace_id": str(scenario["workspace"].id),
            "title": "Doc longo",
            "kind": "text",
            "text": texto_longo,
        },
        format="json",
    )
    document_id = create_resp.data["id"]

    resp = scenario["client"].get(f"/api/copilot/documents/{document_id}/")
    assert resp.status_code == 200
    assert resp.data["text"] == texto_longo
    assert len(resp.data["text"]) == 500


def test_get_detalhe_nega_quem_nao_e_do_workspace(scenario):
    create_resp = scenario["client"].post(
        "/api/copilot/documents/",
        {
            "workspace_id": str(scenario["workspace"].id),
            "title": "Doc privado",
            "kind": "text",
            "text": "Conteúdo privado.",
        },
        format="json",
    )
    document_id = create_resp.data["id"]

    outsider = UserModel.objects.create_user(
        email="fora@t4e.com", password="x", full_name="Fora", is_active=True
    )
    client = APIClient()
    client.force_authenticate(user=outsider)

    resp = client.get(f"/api/copilot/documents/{document_id}/")
    assert resp.status_code == 403


def test_get_detalhe_de_documento_inexistente_e_404(scenario):
    import uuid

    resp = scenario["client"].get(f"/api/copilot/documents/{uuid.uuid4()}/")
    assert resp.status_code == 404


def test_documento_de_texto_colado_nao_tem_file_url(scenario):
    resp = scenario["client"].post(
        "/api/copilot/documents/",
        {
            "workspace_id": str(scenario["workspace"].id),
            "title": "Ata colada",
            "kind": "text",
            "text": "Conteúdo colado, sem arquivo original.",
        },
        format="json",
    )
    assert resp.status_code == 201
    assert resp.data["file_url"] is None

    detail = scenario["client"].get(f"/api/copilot/documents/{resp.data['id']}/")
    assert detail.data["file_url"] is None


def test_upload_de_arquivo_persiste_o_arquivo_original_e_expoe_file_url(scenario):
    """Documento vindo de upload (não texto colado) guarda o arquivo bruto —
    não só o texto extraído — pra permitir download pela UI. Testa direto na
    camada de repositório pra não depender de parsing real de PDF/DOCX."""
    from contexts.copilot.domain.entities.document import Document, DocumentKind
    from contexts.copilot.infrastructure.django.repositories_impl import (
        DjangoDocumentRepository,
    )

    repo = DjangoDocumentRepository()
    doc = Document(
        id=None,
        workspace_id=str(scenario["workspace"].id),
        title="Contrato.pdf",
        kind=DocumentKind.PDF,
        text="Texto extraído do PDF.",
    )
    saved = repo.create(document=doc, file_content=b"%PDF-1.4 conteudo fake", filename="contrato.pdf")

    assert saved.file_url is not None
    assert "contrato" in saved.file_url

    fetched = repo.get(document_id=saved.id)
    assert fetched.file_url == saved.file_url
