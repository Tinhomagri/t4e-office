"""Testes da Onda 2 (paridade Jira): Lexorank, épicos e ciclo de vida de sprint."""
import pytest
from rest_framework.test import APIClient

from contexts.identity.infrastructure.django.models import (
    MembershipModel,
    UserModel,
    WorkspaceModel,
)
from contexts.projects.infrastructure.django.models import CardModel, ProjectModel, SprintModel
from contexts.projects.infrastructure.lexorank import initial_rank_sequence, rank_between

# ── Lexorank puro ─────────────────────────────────────────────────────────────

def test_rank_between_extremos():
    meio = rank_between("", "")
    assert rank_between("", meio) < meio < rank_between(meio, "")


def test_rank_between_vizinhos_adjacentes():
    a, b = "a", "a1"
    r = rank_between(a, b)
    assert a < r < b


def test_rank_between_invalido():
    with pytest.raises(ValueError):
        rank_between("b", "a")


def test_sequencia_inicial_ordenada_e_espacada():
    seq = initial_rank_sequence(100)
    assert seq == sorted(seq)
    assert len(set(seq)) == 100
    # Ainda cabe alguém entre dois vizinhos quaisquer
    meio = rank_between(seq[0], seq[1])
    assert seq[0] < meio < seq[1]


# ── Cenário de API ────────────────────────────────────────────────────────────

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
    return {"owner": owner, "project": project, "client": client}


def _card(project, number, **kw):
    return CardModel.objects.create(project=project, number=number, title=f"C{number}", **kw)


def test_lista_epicos_com_progresso(scenario):
    p = scenario["project"]
    epic = _card(p, 1, type="epic", epic_color="#8270DB")
    _card(p, 2, epic=epic, status="done", points=3)
    _card(p, 3, epic=epic, status="todo", points=5)
    resp = scenario["client"].get(f"/api/projects/{p.id}/epics/")
    assert resp.status_code == 200
    (row,) = resp.json()
    assert row["children_total"] == 2
    assert row["children_done"] == 1
    assert row["points_total"] == 8
    assert row["color"] == "#8270DB"


def test_card_nao_aceita_epic_que_nao_e_epico(scenario):
    p = scenario["project"]
    nao_epico = _card(p, 1, type="feature")
    card = _card(p, 2)
    resp = scenario["client"].patch(
        f"/api/cards/{card.id}/", {"epic_id": str(nao_epico.id)}, format="json"
    )
    assert resp.status_code == 400


def test_atribui_epico_via_patch(scenario):
    p = scenario["project"]
    epic = _card(p, 1, type="epic")
    card = _card(p, 2)
    resp = scenario["client"].patch(
        f"/api/cards/{card.id}/", {"epic_id": str(epic.id)}, format="json"
    )
    assert resp.status_code == 200
    assert resp.json()["epic_id"] == str(epic.id)


def test_iniciar_sprint_exige_cards_e_unicidade(scenario):
    p = scenario["project"]
    client = scenario["client"]
    s1 = SprintModel.objects.create(project=p, name="S1")
    # Sem cards → 400
    resp = client.post(f"/api/sprints/{s1.id}/start/", {}, format="json")
    assert resp.status_code == 400

    _card(p, 1, sprint=s1, status="backlog")
    resp = client.post(f"/api/sprints/{s1.id}/start/", {}, format="json")
    assert resp.status_code == 200
    assert resp.json()["status"] == "active"
    # Card de backlog subiu para todo
    assert CardModel.objects.get(number=1).status == "todo"

    # Segunda sprint ativa é bloqueada
    s2 = SprintModel.objects.create(project=p, name="S2")
    _card(p, 2, sprint=s2)
    resp = client.post(f"/api/sprints/{s2.id}/start/", {}, format="json")
    assert resp.status_code == 400


def test_concluir_sprint_move_abertos_para_backlog(scenario):
    p = scenario["project"]
    client = scenario["client"]
    s1 = SprintModel.objects.create(project=p, name="S1", status="active")
    _card(p, 1, sprint=s1, status="done")
    aberto = _card(p, 2, sprint=s1, status="doing")
    resp = client.post(f"/api/sprints/{s1.id}/complete/", {"move_to": "backlog"}, format="json")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "closed"
    assert body["summary"] == {"completed_cards": 1, "moved_cards": 1, "moved_to": "backlog"}
    aberto.refresh_from_db()
    assert aberto.sprint_id is None and aberto.status == "backlog"


def test_concluir_sprint_move_abertos_para_outra_sprint(scenario):
    p = scenario["project"]
    client = scenario["client"]
    s1 = SprintModel.objects.create(project=p, name="S1", status="active")
    s2 = SprintModel.objects.create(project=p, name="S2")
    aberto = _card(p, 1, sprint=s1, status="todo")
    resp = client.post(f"/api/sprints/{s1.id}/complete/", {"move_to": str(s2.id)}, format="json")
    assert resp.status_code == 200
    aberto.refresh_from_db()
    assert str(aberto.sprint_id) == str(s2.id)


def test_rerank_entre_vizinhos(scenario):
    p = scenario["project"]
    client = scenario["client"]
    a = _card(p, 1, rank="b")
    b = _card(p, 2, rank="d")
    c = _card(p, 3, rank="f")
    resp = client.post(
        f"/api/cards/{c.id}/rank/",
        {"before_id": str(a.id), "after_id": str(b.id)},
        format="json",
    )
    assert resp.status_code == 200
    c.refresh_from_db()
    assert a.rank < c.rank < b.rank


def test_children_de_epico_e_subtarefas(scenario):
    p = scenario["project"]
    client = scenario["client"]
    epic = _card(p, 1, type="epic")
    story = _card(p, 2, epic=epic)
    _card(p, 3, parent=story)
    resp = client.get(f"/api/cards/{epic.id}/children/")
    assert [r["ref"] for r in resp.json()] == ["PRJ-2"]
    resp = client.get(f"/api/cards/{story.id}/children/")
    assert [r["ref"] for r in resp.json()] == ["PRJ-3"]
