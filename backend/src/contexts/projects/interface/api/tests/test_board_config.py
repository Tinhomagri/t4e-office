"""Testes da configuração de quadro/projeto (aba Geral, swimlanes, layout, cores)."""
import pytest
from rest_framework.test import APIClient

from contexts.identity.infrastructure.django.models import (
    MembershipModel,
    UserModel,
    WorkspaceModel,
)
from contexts.projects.infrastructure.django.models import (
    BoardConfigModel,
    ProjectModel,
    WorkflowStatusModel,
)


@pytest.fixture
def scenario(db):
    owner = UserModel.objects.create_user(
        email="owner@t4e.com", password="x", full_name="Owner", is_active=True
    )
    viewer = UserModel.objects.create_user(
        email="viewer@t4e.com", password="x", full_name="Viewer", is_active=True
    )
    ws = WorkspaceModel.objects.create(name="WS", slug="ws", owner=owner)
    MembershipModel.objects.create(workspace=ws, user=owner, role="owner")
    MembershipModel.objects.create(workspace=ws, user=viewer, role="member")
    project = ProjectModel.objects.create(workspace=ws, name="Proj", key="PRJ")
    client = APIClient()
    client.force_authenticate(user=owner)
    viewer_client = APIClient()
    viewer_client.force_authenticate(user=viewer)
    return {
        "owner": owner, "viewer": viewer, "workspace": ws, "project": project,
        "client": client, "viewer_client": viewer_client,
    }


# ── Geral ─────────────────────────────────────────────────────────────────────

def test_get_projeto_traz_campos_de_identidade(scenario):
    project = scenario["project"]
    resp = scenario["client"].get(f"/api/projects/{project.id}/")
    assert resp.status_code == 200
    assert resp.data["key"] == "PRJ"
    assert resp.data["avatar_color"] == "#6366f1"
    assert resp.data["avatar_url"] is None


def test_patch_atualiza_nome_avatar_e_lead(scenario):
    project = scenario["project"]
    resp = scenario["client"].patch(
        f"/api/projects/{project.id}/",
        {
            "name": "Vallinor",
            "description": "Plataforma da secretaria",
            "category": "Saúde",
            "avatar_emoji": "🏥",
            "avatar_color": "#ef4444",
            "lead_id": str(scenario["owner"].id),
        },
        format="json",
    )
    assert resp.status_code == 200
    project.refresh_from_db()
    assert project.name == "Vallinor"
    assert project.avatar_emoji == "🏥"
    assert str(project.lead_id) == str(scenario["owner"].id)


def test_patch_normaliza_chave_para_maiuscula(scenario):
    project = scenario["project"]
    resp = scenario["client"].patch(
        f"/api/projects/{project.id}/", {"key": "val"}, format="json"
    )
    assert resp.status_code == 200
    assert resp.data["key"] == "VAL"


def test_patch_rejeita_chave_duplicada_no_workspace(scenario):
    ProjectModel.objects.create(
        workspace=scenario["workspace"], name="Outro", key="OUT"
    )
    resp = scenario["client"].patch(
        f"/api/projects/{scenario['project'].id}/", {"key": "OUT"}, format="json"
    )
    assert resp.status_code == 400


def test_patch_rejeita_chave_vazia(scenario):
    resp = scenario["client"].patch(
        f"/api/projects/{scenario['project'].id}/", {"key": "  "}, format="json"
    )
    assert resp.status_code == 400


def test_lead_id_vazio_limpa_o_campo(scenario):
    project = scenario["project"]
    project.lead_id = scenario["owner"].id
    project.save()
    resp = scenario["client"].patch(
        f"/api/projects/{project.id}/", {"lead_id": ""}, format="json"
    )
    assert resp.status_code == 200
    project.refresh_from_db()
    assert project.lead_id is None


# ── Board config ──────────────────────────────────────────────────────────────

def test_board_config_e_criado_com_defaults_no_primeiro_acesso(scenario):
    project = scenario["project"]
    assert not BoardConfigModel.objects.filter(project=project).exists()

    resp = scenario["client"].get(f"/api/projects/{project.id}/board-config/")
    assert resp.status_code == 200
    assert resp.data["swimlane_mode"] == "none"
    assert resp.data["card_color_rule"] == "none"
    assert resp.data["card_fields"] == BoardConfigModel.DEFAULT_CARD_FIELDS
    assert "cover_image" in resp.data["available_card_fields"]
    assert BoardConfigModel.objects.filter(project=project).exists()


def test_patch_swimlane_e_regra_de_cor(scenario):
    project = scenario["project"]
    resp = scenario["client"].patch(
        f"/api/projects/{project.id}/board-config/",
        {
            "swimlane_mode": "assignee",
            "card_color_rule": "priority",
            "card_color_map": {"high": "#ef4444"},
            "hide_done_after_days": 14,
        },
        format="json",
    )
    assert resp.status_code == 200
    assert resp.data["swimlane_mode"] == "assignee"
    assert resp.data["card_color_map"] == {"high": "#ef4444"}
    assert resp.data["hide_done_after_days"] == 14


def test_swimlane_invalido_e_rejeitado(scenario):
    resp = scenario["client"].patch(
        f"/api/projects/{scenario['project'].id}/board-config/",
        {"swimlane_mode": "planeta"},
        format="json",
    )
    assert resp.status_code == 400


def test_card_fields_desconhecido_e_rejeitado(scenario):
    resp = scenario["client"].patch(
        f"/api/projects/{scenario['project'].id}/board-config/",
        {"card_fields": ["key", "campo_que_nao_existe"]},
        format="json",
    )
    assert resp.status_code == 400


def test_card_fields_sai_na_ordem_canonica(scenario):
    """A ordem enviada pelo cliente não deve mudar a ordem de render do card."""
    resp = scenario["client"].patch(
        f"/api/projects/{scenario['project'].id}/board-config/",
        {"card_fields": ["assignee", "key", "priority"]},
        format="json",
    )
    assert resp.status_code == 200
    assert resp.data["card_fields"] == ["key", "priority", "assignee"]


# ── Colunas: WIP e reordenação ────────────────────────────────────────────────

def _seed_statuses(project):
    return [
        WorkflowStatusModel.objects.create(
            project=project, name=name, slug=slug, category=cat, order=i
        )
        for i, (name, slug, cat) in enumerate(
            [("A fazer", "todo", "todo"), ("Fazendo", "doing", "in_progress"),
             ("Feito", "done", "done")]
        )
    ]


def test_define_e_limpa_wip_limit(scenario):
    todo = _seed_statuses(scenario["project"])[0]

    resp = scenario["client"].patch(
        f"/api/workflow-statuses/{todo.id}/", {"wip_limit": 3}, format="json"
    )
    assert resp.status_code == 200
    assert resp.data["wip_limit"] == 3

    cleared = scenario["client"].patch(
        f"/api/workflow-statuses/{todo.id}/", {"wip_limit": 0}, format="json"
    )
    assert cleared.status_code == 200
    assert cleared.data["wip_limit"] is None


def test_reorder_aplica_nova_ordem(scenario):
    project = scenario["project"]
    todo, doing, done = _seed_statuses(project)

    resp = scenario["client"].post(
        f"/api/projects/{project.id}/workflow-statuses/reorder/",
        {"status_ids": [str(done.id), str(todo.id), str(doing.id)]},
        format="json",
    )
    assert resp.status_code == 200
    assert [s["slug"] for s in resp.data] == ["done", "todo", "doing"]


def test_reorder_exige_lista_completa_de_colunas(scenario):
    project = scenario["project"]
    todo, _doing, _done = _seed_statuses(project)

    resp = scenario["client"].post(
        f"/api/projects/{project.id}/workflow-statuses/reorder/",
        {"status_ids": [str(todo.id)]},
        format="json",
    )
    assert resp.status_code == 400


def test_reorder_rejeita_lista_vazia(scenario):
    resp = scenario["client"].post(
        f"/api/projects/{scenario['project'].id}/workflow-statuses/reorder/",
        {"status_ids": []},
        format="json",
    )
    assert resp.status_code == 400


# ── Permissões ────────────────────────────────────────────────────────────────

def test_membro_le_config_mas_nao_edita(scenario):
    project = scenario["project"]
    viewer_client = scenario["viewer_client"]

    assert viewer_client.get(f"/api/projects/{project.id}/board-config/").status_code == 200

    # `member` de workspace vira `developer` no projeto — sem ADMINISTER_PROJECT.
    blocked = viewer_client.patch(
        f"/api/projects/{project.id}/board-config/",
        {"swimlane_mode": "epic"},
        format="json",
    )
    assert blocked.status_code == 403


def test_nao_membro_nao_acessa(scenario, db):
    outsider = UserModel.objects.create_user(
        email="fora@t4e.com", password="x", full_name="Fora", is_active=True
    )
    client = APIClient()
    client.force_authenticate(user=outsider)
    resp = client.get(f"/api/projects/{scenario['project'].id}/board-config/")
    assert resp.status_code in (403, 404)
