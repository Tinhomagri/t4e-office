"""Ciclo de vida da sprint no padrão do Jira: iniciar com nome/datas/meta,
editar, concluir mandando os abertos para backlog, sprint existente ou nova."""
from datetime import date

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
    project = ProjectModel.objects.create(workspace=ws, name="Proj", key="PRJ")
    for order, (slug, cat) in enumerate(
        [("todo", "todo"), ("fazendo", "in_progress"), ("entregue", "done")]
    ):
        WorkflowStatusModel.objects.create(
            project=project, name=slug, slug=slug, category=cat, order=order
        )
    client = APIClient()
    client.force_authenticate(user=owner)
    return {"project": project, "client": client, "owner": owner}


def _card(project, n, **kw):
    return CardModel.objects.create(project=project, number=n, title=f"C{n}", **kw)


def _sprint(scenario, **kw):
    return SprintModel.objects.create(project=scenario["project"], **{"name": "Sprint 1", **kw})


# ── iniciar ───────────────────────────────────────────────────────────────────

def test_iniciar_com_nome_datas_e_meta(scenario):
    s = _sprint(scenario)
    _card(scenario["project"], 1, sprint=s)
    resp = scenario["client"].post(
        f"/api/sprints/{s.id}/start/",
        {"name": "Sprint 12", "start_date": "2026-10-12", "end_date": "2026-10-23",
         "goal": "Checkout no ar"},
        format="json",
    )
    assert resp.status_code == 200
    s.refresh_from_db()
    assert (s.name, s.start_date, s.end_date, s.goal, s.status) == (
        "Sprint 12", date(2026, 10, 12), date(2026, 10, 23), "Checkout no ar", "active",
    )
    assert s.started_at is not None


def test_iniciar_so_com_inicio_assume_duas_semanas(scenario):
    s = _sprint(scenario)
    _card(scenario["project"], 1, sprint=s)
    resp = scenario["client"].post(
        f"/api/sprints/{s.id}/start/", {"start_date": "2026-10-12"}, format="json"
    )
    assert resp.status_code == 200
    s.refresh_from_db()
    assert s.end_date == date(2026, 10, 26)


@pytest.mark.parametrize(
    "payload",
    [
        {"start_date": "2026-10-23", "end_date": "2026-10-12"},
        {"start_date": "ontem"},
        {"name": "   "},
    ],
)
def test_iniciar_rejeita_dados_invalidos(scenario, payload):
    s = _sprint(scenario)
    _card(scenario["project"], 1, sprint=s)
    resp = scenario["client"].post(f"/api/sprints/{s.id}/start/", payload, format="json")
    assert resp.status_code == 400
    s.refresh_from_db()
    assert s.status == "planned"


# ── editar ────────────────────────────────────────────────────────────────────

def test_editar_sprint_ativa_nome_meta_e_datas(scenario):
    s = _sprint(scenario, status="active", start_date=date(2026, 10, 12), end_date=date(2026, 10, 23))
    resp = scenario["client"].patch(
        f"/api/sprints/{s.id}/",
        {"name": "Sprint 12b", "goal": "Nova meta", "end_date": "2026-10-30"},
        format="json",
    )
    assert resp.status_code == 200
    s.refresh_from_db()
    assert (s.name, s.goal, s.end_date) == ("Sprint 12b", "Nova meta", date(2026, 10, 30))


def test_editar_rejeita_fim_antes_do_inicio(scenario):
    s = _sprint(scenario, start_date=date(2026, 10, 12), end_date=date(2026, 10, 23))
    resp = scenario["client"].patch(
        f"/api/sprints/{s.id}/", {"end_date": "2026-10-01"}, format="json"
    )
    assert resp.status_code == 400


def test_patch_nao_muda_status(scenario):
    """Iniciar/concluir só pelas rotas próprias — o PATCH pulava validação,
    permissão e datas de início/fim."""
    s = _sprint(scenario)
    resp = scenario["client"].patch(f"/api/sprints/{s.id}/", {"status": "active"}, format="json")
    assert resp.status_code == 400
    s.refresh_from_db()
    assert s.status == "planned"


def test_editar_exige_permissao_de_gerenciar_sprints(scenario):
    s = _sprint(scenario)
    intruso = UserModel.objects.create_user(
        email="x@t4e.com", password="x", full_name="X", is_active=True
    )
    client = APIClient()
    client.force_authenticate(user=intruso)
    resp = client.patch(f"/api/sprints/{s.id}/", {"name": "Hack"}, format="json")
    assert resp.status_code in (403, 404)


# ── concluir ──────────────────────────────────────────────────────────────────

def test_concluido_e_pela_categoria_da_coluna_nao_pelo_slug(scenario):
    p = scenario["project"]
    s = _sprint(scenario, status="active")
    feito = _card(p, 1, sprint=s, status="entregue")  # coluna "done" com outro slug
    aberto = _card(p, 2, sprint=s, status="fazendo")
    resp = scenario["client"].post(
        f"/api/sprints/{s.id}/complete/", {"move_to": "backlog"}, format="json"
    )
    assert resp.status_code == 200
    assert resp.json()["summary"]["completed_cards"] == 1
    assert resp.json()["summary"]["moved_cards"] == 1
    feito.refresh_from_db()
    aberto.refresh_from_db()
    assert str(feito.sprint_id) == str(s.id)
    # Igual ao Jira: sai da sprint mas mantém o status.
    assert aberto.sprint_id is None and aberto.status == "fazendo"


def test_concluir_para_nova_sprint_cria_e_move(scenario):
    p = scenario["project"]
    s = _sprint(scenario, name="Sprint 12", status="active")
    aberto = _card(p, 1, sprint=s, status="todo")
    resp = scenario["client"].post(
        f"/api/sprints/{s.id}/complete/", {"move_to": "new"}, format="json"
    )
    assert resp.status_code == 200
    nova = SprintModel.objects.exclude(id=s.id).get()
    assert (nova.name, nova.status) == ("Sprint 13", "planned")
    assert resp.json()["summary"]["moved_to"] == str(nova.id)
    aberto.refresh_from_db()
    assert aberto.sprint_id == nova.id


def test_concluir_para_nova_sprint_com_nome_escolhido(scenario):
    s = _sprint(scenario, status="active")
    _card(scenario["project"], 1, sprint=s, status="todo")
    scenario["client"].post(
        f"/api/sprints/{s.id}/complete/",
        {"move_to": "new", "new_sprint_name": "Hardening"},
        format="json",
    )
    assert SprintModel.objects.filter(name="Hardening", status="planned").exists()


def test_concluir_grava_historico_da_saida_da_sprint(scenario):
    p = scenario["project"]
    s = _sprint(scenario, status="active")
    s2 = _sprint(scenario, name="Sprint 2")
    aberto = _card(p, 1, sprint=s, status="todo")
    scenario["client"].post(
        f"/api/sprints/{s.id}/complete/", {"move_to": str(s2.id)}, format="json"
    )
    h = CardHistoryModel.objects.get(card=aberto, field="sprint_id")
    assert (h.old_value, h.new_value) == (str(s.id), str(s2.id))
    assert h.author_id == scenario["owner"].id


def test_concluir_previa_mostra_contagens(scenario):
    """GET /complete/ = prévia do diálogo: concluídos × abertos e sugestão de
    nome da próxima sprint."""
    p = scenario["project"]
    s = _sprint(scenario, name="Sprint 7", status="active")
    _card(p, 1, sprint=s, status="entregue")
    _card(p, 2, sprint=s, status="todo")
    _card(p, 3, sprint=s, status="fazendo")
    body = scenario["client"].get(f"/api/sprints/{s.id}/complete/").json()
    assert body == {"completed_cards": 1, "open_cards": 2, "suggested_name": "Sprint 8"}
