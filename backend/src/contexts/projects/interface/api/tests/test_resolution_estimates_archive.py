"""Desfecho (resolution), estimativas de tempo e arquivamento de card.

O que estes testes protegem: "estar na coluna Concluído" e "ter sido entregue"
são fatos diferentes, e relatório que confunde os dois mente sobre a produção da
equipe.
"""
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
        email="res@t4e.com", password="x", full_name="Owner", is_active=True
    )
    ws = WorkspaceModel.objects.create(name="WS", slug="ws-res", owner=owner)
    MembershipModel.objects.create(workspace=ws, user=owner, role="owner")
    project = ProjectModel.objects.create(workspace=ws, name="Proj", key="RES")
    # Workflow explícito: é ele que diz qual coluna significa "concluído".
    for slug, name, category, order in (
        ("todo", "A fazer", "todo", 0),
        ("doing", "Em andamento", "in_progress", 1),
        ("done", "Concluído", "done", 2),
    ):
        WorkflowStatusModel.objects.create(
            project=project, slug=slug, name=name, category=category, order=order
        )
    client = APIClient()
    client.force_authenticate(user=owner)
    return {"owner": owner, "project": project, "client": client}


def _card(project, number, **kw):
    return CardModel.objects.create(
        project=project, number=number, title=f"C{number}", **kw
    )


# ── Resolução automática ──────────────────────────────────────────────────────

def test_mover_para_coluna_done_resolve_como_entregue(scenario):
    card = _card(scenario["project"], 1, status="todo")
    resp = scenario["client"].patch(
        f"/api/cards/{card.id}/", {"status": "done"}, format="json"
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["resolution"] == "done"
    assert body["resolved_at"] is not None


def test_sair_da_coluna_done_reabre_o_card(scenario):
    card = _card(scenario["project"], 1, status="todo")
    client = scenario["client"]
    client.patch(f"/api/cards/{card.id}/", {"status": "done"}, format="json")
    resp = client.patch(f"/api/cards/{card.id}/", {"status": "doing"}, format="json")
    assert resp.status_code == 200
    assert resp.json()["resolution"] is None
    assert resp.json()["resolved_at"] is None


def test_desfecho_explicito_sobrevive_a_ida_para_done(scenario):
    """Marcar "não será feito" e só depois arrastar para Concluído.

    O automático não pode sobrescrever a decisão de quem escolheu o desfecho.
    """
    card = _card(scenario["project"], 1, status="todo")
    client = scenario["client"]
    client.patch(f"/api/cards/{card.id}/", {"resolution": "wont_do"}, format="json")
    resp = client.patch(f"/api/cards/{card.id}/", {"status": "done"}, format="json")
    assert resp.status_code == 200
    assert resp.json()["resolution"] == "wont_do"


def test_limpar_desfecho_via_string_vazia(scenario):
    card = _card(scenario["project"], 1, status="todo")
    client = scenario["client"]
    client.patch(f"/api/cards/{card.id}/", {"resolution": "duplicate"}, format="json")
    resp = client.patch(f"/api/cards/{card.id}/", {"resolution": ""}, format="json")
    assert resp.status_code == 200
    assert resp.json()["resolution"] is None
    assert resp.json()["resolved_at"] is None


# ── Velocity conta entrega, não coluna ────────────────────────────────────────

def test_velocity_ignora_card_cancelado_na_coluna_done(scenario):
    """O ponto central da mudança: cancelado em Concluído não é entrega."""
    p = scenario["project"]
    sprint = SprintModel.objects.create(
        project=p, name="S1", status="closed", start_date="2026-01-01", end_date="2026-01-14"
    )
    entregue = _card(p, 1, status="todo", points=5, sprint=sprint)
    cancelado = _card(p, 2, status="todo", points=8, sprint=sprint)
    client = scenario["client"]
    client.patch(f"/api/cards/{entregue.id}/", {"status": "done"}, format="json")
    client.patch(
        f"/api/cards/{cancelado.id}/",
        {"resolution": "wont_do", "status": "done"},
        format="json",
    )

    resp = client.get(f"/api/projects/{p.id}/reports/")
    assert resp.status_code == 200
    (row,) = [r for r in resp.json()["velocity"] if r["sprint"] == "S1"]
    # Comprometido soma os dois; entregue só o que de fato saiu.
    assert row["committed"] == 13
    assert row["delivered"] == 5


# ── Estimativas ───────────────────────────────────────────────────────────────

def test_grava_estimativa_e_restante(scenario):
    card = _card(scenario["project"], 1)
    resp = scenario["client"].patch(
        f"/api/cards/{card.id}/",
        {"original_estimate_seconds": 14400, "remaining_estimate_seconds": 3600},
        format="json",
    )
    assert resp.status_code == 200
    assert resp.json()["original_estimate_seconds"] == 14400
    assert resp.json()["remaining_estimate_seconds"] == 3600


def test_estimativa_negativa_e_rejeitada(scenario):
    card = _card(scenario["project"], 1)
    resp = scenario["client"].patch(
        f"/api/cards/{card.id}/", {"original_estimate_seconds": -1}, format="json"
    )
    assert resp.status_code == 400


# ── Arquivamento ──────────────────────────────────────────────────────────────

def test_arquivar_remove_do_board_sem_apagar(scenario):
    p = scenario["project"]
    fica = _card(p, 1)
    arquiva = _card(p, 2)
    client = scenario["client"]

    resp = client.patch(f"/api/cards/{arquiva.id}/", {"archived": True}, format="json")
    assert resp.status_code == 200
    assert resp.json()["archived"] is True

    listagem = client.get(f"/api/projects/{p.id}/cards/")
    ids = {c["id"] for c in listagem.json()}
    assert str(fica.id) in ids
    assert str(arquiva.id) not in ids
    # Continua existindo: arquivar preserva histórico.
    assert CardModel.objects.filter(id=arquiva.id).exists()


def test_desarquivar_devolve_ao_board(scenario):
    p = scenario["project"]
    card = _card(p, 1)
    client = scenario["client"]
    client.patch(f"/api/cards/{card.id}/", {"archived": True}, format="json")
    resp = client.patch(f"/api/cards/{card.id}/", {"archived": False}, format="json")
    assert resp.status_code == 200
    assert resp.json()["archived"] is False
    ids = {c["id"] for c in client.get(f"/api/projects/{p.id}/cards/").json()}
    assert str(card.id) in ids


def test_rearquivar_nao_reescreve_a_data(scenario):
    card = _card(scenario["project"], 1)
    client = scenario["client"]
    primeiro = client.patch(
        f"/api/cards/{card.id}/", {"archived": True}, format="json"
    ).json()["archived_at"]
    segundo = client.patch(
        f"/api/cards/{card.id}/", {"archived": True}, format="json"
    ).json()["archived_at"]
    assert primeiro == segundo
