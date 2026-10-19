"""Pausar/retomar card em andamento: o tempo só conta enquanto o card está numa
coluna `is_working` e não está pausado."""
import pytest
from rest_framework.test import APIClient

from contexts.identity.infrastructure.django.models import (
    MembershipModel,
    UserModel,
    WorkspaceModel,
)
from contexts.projects.infrastructure.django.models import (
    CardHistoryModel,
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
    WorkflowStatusModel.objects.create(
        project=project, name="A fazer", slug="todo", category="todo", order=0
    )
    WorkflowStatusModel.objects.create(
        project=project, name="Em andamento", slug="em-andamento",
        category="in_progress", order=1, is_working=True,
    )
    card = CardModel.objects.create(
        project=project, number=1, title="C1", status="em-andamento", assignee=owner
    )
    CardHistoryModel.objects.create(
        card=card, field="status", old_value="todo", new_value="em-andamento"
    )
    client = APIClient()
    client.force_authenticate(user=owner)
    return {"owner": owner, "project": project, "card": card, "client": client}


def _row(scenario):
    p = scenario["project"]
    rows = scenario["client"].get(f"/api/projects/{p.id}/cards/").json()
    return next(r for r in rows if r["id"] == str(scenario["card"].id))


def test_pausar_registra_no_historico_e_para_o_contador(scenario):
    card = scenario["card"]
    resp = scenario["client"].post(f"/api/cards/{card.id}/pause/")
    assert resp.status_code == 200
    assert resp.json()["paused_at"] is not None
    assert resp.json()["doing_since"] is None

    entry = CardHistoryModel.objects.filter(card=card, field="paused").get()
    assert entry.new_value == "1"
    assert entry.author_id == scenario["owner"].id

    row = _row(scenario)
    assert row["paused_at"] is not None
    assert row["doing_since"] is None
    assert row["worked_seconds"] >= 0


def test_pausar_de_novo_nao_duplica_historico(scenario):
    card = scenario["card"]
    scenario["client"].post(f"/api/cards/{card.id}/pause/")
    resp = scenario["client"].post(f"/api/cards/{card.id}/pause/")
    assert resp.status_code == 200
    assert CardHistoryModel.objects.filter(card=card, field="paused").count() == 1


def test_retomar_volta_a_contar(scenario):
    card = scenario["card"]
    scenario["client"].post(f"/api/cards/{card.id}/pause/")
    resp = scenario["client"].post(f"/api/cards/{card.id}/resume/")
    assert resp.status_code == 200
    assert resp.json()["paused_at"] is None
    assert resp.json()["doing_since"] is not None

    row = _row(scenario)
    assert row["paused_at"] is None
    assert row["doing_since"] is not None


def test_nao_pausa_card_fora_de_coluna_em_andamento(scenario):
    card = scenario["card"]
    card.status = "todo"
    card.save(update_fields=["status"])
    resp = scenario["client"].post(f"/api/cards/{card.id}/pause/")
    assert resp.status_code == 400
    assert not CardHistoryModel.objects.filter(card=card, field="paused").exists()


def test_quem_nao_e_do_projeto_nao_pausa(scenario):
    estranho = UserModel.objects.create_user(
        email="x@t4e.com", password="x", full_name="X", is_active=True
    )
    client = APIClient()
    client.force_authenticate(user=estranho)
    resp = client.post(f"/api/cards/{scenario['card'].id}/pause/")
    assert resp.status_code in (403, 404)


def test_mover_card_pausado_pra_outra_coluna_limpa_a_pausa(scenario):
    card = scenario["card"]
    client = scenario["client"]
    client.post(f"/api/cards/{card.id}/pause/")
    client.patch(f"/api/cards/{card.id}/", {"status": "todo"}, format="json")
    client.patch(f"/api/cards/{card.id}/", {"status": "em-andamento"}, format="json")
    row = _row(scenario)
    assert row["paused_at"] is None
    assert row["doing_since"] is not None


def test_listagem_card_fora_de_andamento_sem_tempo_aberto(scenario):
    card = scenario["card"]
    card.status = "todo"
    card.save(update_fields=["status"])
    row = _row(scenario)
    assert row["doing_since"] is None
    assert row["paused_at"] is None


def test_card_bloqueado_em_andamento_para_de_contar(scenario):
    card = scenario["card"]
    resp = scenario["client"].patch(
        f"/api/cards/{card.id}/", {"blocked": True, "block_reason": "Sem acesso"}, format="json"
    )
    assert resp.status_code == 200
    row = _row(scenario)
    assert row["doing_since"] is None
    assert row["paused_at"] is None
    assert row["blocked_in_progress"] is True
    scenario["client"].patch(f"/api/cards/{card.id}/", {"blocked": False}, format="json")
    row = _row(scenario)
    assert row["doing_since"] is not None and row["blocked_in_progress"] is False
