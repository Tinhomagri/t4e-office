"""Testes do hub de marketing: relatório de campanha e biblioteca de peças."""
from datetime import date, timedelta

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from contexts.identity.infrastructure.django.models import (
    MembershipModel,
    UserModel,
    WorkspaceModel,
)
from contexts.projects.infrastructure.django.models import (
    AttachmentModel,
    CardModel,
    ProjectModel,
    WorkflowStatusModel,
)


@pytest.fixture
def scenario(db):
    owner = UserModel.objects.create_user(
        email="owner@t4e.com", password="x", full_name="Owner", is_active=True
    )
    outsider = UserModel.objects.create_user(
        email="out@t4e.com", password="x", full_name="Out", is_active=True
    )
    ws = WorkspaceModel.objects.create(name="WS", slug="ws", owner=owner)
    MembershipModel.objects.create(workspace=ws, user=owner, role="owner")
    project = ProjectModel.objects.create(
        workspace=ws, name="Campanha", key="MKT", template="campanha"
    )
    WorkflowStatusModel.objects.create(
        project=project, slug="publicado", name="Publicado", category="done", order=5
    )

    client = APIClient()
    client.force_authenticate(user=owner)
    outsider_client = APIClient()
    outsider_client.force_authenticate(user=outsider)
    return {
        "owner": owner,
        "project": project,
        "client": client,
        "outsider_client": outsider_client,
    }


def _card(project, number, **kw):
    return CardModel.objects.create(
        project=project, number=number, title=f"Peça {number}", **kw
    )


def test_relatorio_agrega_totais_fila_e_aprovacao(scenario):
    p = scenario["project"]
    owner = scenario["owner"]
    today = date.today()
    # Publicada, atrasada, hoje e próxima semana
    _card(p, 1, channel="instagram", publish_date=today - timedelta(days=3), status="publicado")
    late = _card(p, 2, channel="instagram", publish_date=today - timedelta(days=1), status="criacao")
    _card(p, 3, channel="blog", publish_date=today, status="agendado")
    _card(p, 4, channel="email", publish_date=today + timedelta(days=2), status="criacao")

    # Decisões de aprovação: 1 aprovada e 1 reprovada
    AttachmentModel.objects.create(
        card=late, author=owner, filename="v1.png", size=1,
        approval_status="rejected", version=1,
    )
    AttachmentModel.objects.create(
        card=late, author=owner, filename="v2.png", size=1,
        approval_status="approved", version=2,
    )

    resp = scenario["client"].get(f"/api/projects/{p.id}/marketing-report/")
    assert resp.status_code == 200
    data = resp.data
    assert data["totals"] == {"cards": 4, "planned": 4, "published": 1, "overdue": 1}
    assert data["by_channel"] == {"instagram": 2, "blog": 1, "email": 1}
    assert data["approval"] == {"approved": 1, "rejected": 1, "rate": 50}
    assert [c["ref"] for c in data["queue"]["overdue"]] == ["MKT-2"]
    assert [c["ref"] for c in data["queue"]["today"]] == ["MKT-3"]
    assert [c["ref"] for c in data["queue"]["week"]] == ["MKT-4"]
    assert "publicado" in data["done_statuses"]


def test_biblioteca_lista_apenas_ultima_versao_aprovada_com_filtro(scenario):
    p = scenario["project"]
    owner = scenario["owner"]
    insta = _card(p, 1, channel="instagram")
    blog = _card(p, 2, channel="blog")

    file = SimpleUploadedFile("arte.png", b"png", content_type="image/png")
    a1 = AttachmentModel.objects.create(
        card=insta, author=owner, filename="arte-v1.png", file=file, size=3,
        approval_status="approved", version=1,
    )
    # v2 do mesmo grupo, também aprovada — só ela deve aparecer
    AttachmentModel.objects.create(
        card=insta, author=owner, filename="arte-v2.png", size=3,
        group_id=a1.group_id, approval_status="approved", version=2,
    )
    AttachmentModel.objects.create(
        card=blog, author=owner, filename="capa.png", size=3,
        approval_status="approved", version=1,
    )
    AttachmentModel.objects.create(
        card=blog, author=owner, filename="reprovada.png", size=3,
        approval_status="rejected", version=1,
    )

    resp = scenario["client"].get(f"/api/projects/{p.id}/marketing-assets/")
    assert resp.status_code == 200
    names = {a["filename"] for a in resp.data}
    assert names == {"arte-v2.png", "capa.png"}

    filtered = scenario["client"].get(
        f"/api/projects/{p.id}/marketing-assets/", {"channel": "instagram"}
    )
    assert [a["filename"] for a in filtered.data] == ["arte-v2.png"]
    assert filtered.data[0]["card"]["ref"] == "MKT-1"


def test_nao_membro_nao_acessa_relatorio(scenario):
    p = scenario["project"]
    resp = scenario["outsider_client"].get(f"/api/projects/{p.id}/marketing-report/")
    assert resp.status_code == 403
