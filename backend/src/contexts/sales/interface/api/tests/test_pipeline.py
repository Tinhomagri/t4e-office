"""Testes da fundação comercial: funil, negócios, ganho/perda e atividades."""
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from contexts.identity.infrastructure.django.models import (
    MembershipModel,
    UserModel,
    WorkspaceModel,
)
from contexts.projects.infrastructure.django.models import ProjectModel
from contexts.sales.application.use_cases.seed_default_stages import SeedDefaultStages
from contexts.sales.infrastructure.django.models import (
    CustomerModel,
    DealActivityModel,
    DealHistoryModel,
    DealModel,
    PipelineStageModel,
)
from contexts.sales.infrastructure.django.repositories_impl import DjangoStageRepository


@pytest.fixture
def scenario(db):
    """Workspace com dono, funil padrão semeado e um cliente."""
    owner = UserModel.objects.create_user(
        email="comercial@t4e.com", password="x", full_name="Comercial", is_active=True
    )
    outsider = UserModel.objects.create_user(
        email="fora@t4e.com", password="x", full_name="Fora", is_active=True
    )
    ws = WorkspaceModel.objects.create(name="WS", slug="ws-sales", owner=owner)
    MembershipModel.objects.create(workspace=ws, user=owner, role="owner")
    SeedDefaultStages(DjangoStageRepository()).execute(workspace_id=str(ws.id))
    customer = CustomerModel.objects.create(
        workspace=ws, name="Acme Ltda", kind="company", owner=owner
    )
    client = APIClient()
    client.force_authenticate(user=owner)
    return {
        "owner": owner,
        "outsider": outsider,
        "workspace": ws,
        "customer": customer,
        "client": client,
    }


def _stage(ws, slug: str) -> PipelineStageModel:
    return PipelineStageModel.objects.get(workspace=ws, slug=slug)


def _deal(scenario, **kw) -> DealModel:
    ws = scenario["workspace"]
    defaults = {
        "workspace": ws,
        "title": "Projeto novo",
        "customer": scenario["customer"],
        "stage": _stage(ws, "lead"),
        "amount": Decimal("10000.00"),
        "probability": _stage(ws, "lead").probability_default,
        "owner": scenario["owner"],
        "rank": "m",
    }
    defaults.update(kw)
    return DealModel.objects.create(**defaults)


# ── Seed dos estágios ────────────────────────────────────────────────────────

def test_seed_cria_funil_padrao_uma_unica_vez(db):
    owner = UserModel.objects.create_user(
        email="a@t4e.com", password="x", full_name="A", is_active=True
    )
    ws = WorkspaceModel.objects.create(name="W", slug="w-seed", owner=owner)
    use_case = SeedDefaultStages(DjangoStageRepository())
    first = use_case.execute(workspace_id=str(ws.id))
    second = use_case.execute(workspace_id=str(ws.id))
    assert len(first) == 6
    assert len(second) == 6
    assert PipelineStageModel.objects.filter(workspace=ws).count() == 6
    assert PipelineStageModel.objects.filter(workspace=ws, kind="won").count() == 1
    assert PipelineStageModel.objects.filter(workspace=ws, kind="lost").count() == 1


def test_listar_estagios_semeia_no_primeiro_acesso(scenario):
    ws = scenario["workspace"]
    resp = scenario["client"].get(f"/api/sales/stages/?workspace_id={ws.id}")
    assert resp.status_code == 200
    slugs = [s["slug"] for s in resp.json()]
    assert slugs == ["lead", "qualificacao", "proposta", "negociacao", "ganho", "perdido"]


def test_nao_remove_o_ultimo_estagio_de_ganho(scenario):
    ws = scenario["workspace"]
    ganho = _stage(ws, "ganho")
    resp = scenario["client"].delete(f"/api/sales/stages/{ganho.id}/")
    assert resp.status_code == 400
    assert "ganho" in resp.json()["error"]


# ── Mover de estágio ─────────────────────────────────────────────────────────

def test_move_estagio_aplica_probabilidade_padrao(scenario):
    """Probabilidade ainda no padrão da origem → assume o padrão do destino."""
    ws = scenario["workspace"]
    deal = _deal(scenario)  # probabilidade 10 (padrão de Lead)
    proposta = _stage(ws, "proposta")
    resp = scenario["client"].post(
        f"/api/sales/deals/{deal.id}/move/", {"stage_id": str(proposta.id)}, format="json"
    )
    assert resp.status_code == 200
    assert resp.json()["probability"] == proposta.probability_default == 50
    assert DealHistoryModel.objects.filter(deal=deal, field="stage").count() == 1


def test_move_estagio_preserva_probabilidade_editada(scenario):
    """Probabilidade editada manualmente pelo usuário não é sobrescrita."""
    ws = scenario["workspace"]
    deal = _deal(scenario, probability=42)
    proposta = _stage(ws, "proposta")
    resp = scenario["client"].post(
        f"/api/sales/deals/{deal.id}/move/", {"stage_id": str(proposta.id)}, format="json"
    )
    assert resp.status_code == 200
    assert resp.json()["probability"] == 42


def test_move_para_o_mesmo_estagio_falha(scenario):
    ws = scenario["workspace"]
    deal = _deal(scenario)
    resp = scenario["client"].post(
        f"/api/sales/deals/{deal.id}/move/",
        {"stage_id": str(_stage(ws, "lead").id)},
        format="json",
    )
    assert resp.status_code == 400


# ── Ganhar ───────────────────────────────────────────────────────────────────

def test_ganhar_sem_criar_projeto(scenario):
    ws = scenario["workspace"]
    deal = _deal(scenario)
    resp = scenario["client"].post(
        f"/api/sales/deals/{deal.id}/win/", {"create_delivery_project": False}, format="json"
    )
    assert resp.status_code == 200
    body = resp.json()["deal"]
    assert body["won_at"] is not None
    assert body["stage_id"] == str(_stage(ws, "ganho").id)
    assert body["delivery_project_id"] is None
    assert body["created_delivery_project"] is False
    assert ProjectModel.objects.filter(workspace=ws).count() == 0


def test_ganhar_criando_projeto_de_entrega(scenario):
    ws = scenario["workspace"]
    deal = _deal(scenario)
    resp = scenario["client"].post(
        f"/api/sales/deals/{deal.id}/win/", {"create_delivery_project": True}, format="json"
    )
    assert resp.status_code == 200
    body = resp.json()["deal"]
    assert body["created_delivery_project"] is True
    assert body["delivery_project_id"] is not None
    project = ProjectModel.objects.get(id=body["delivery_project_id"])
    assert project.workspace_id == ws.id
    assert project.name == "Acme Ltda — Projeto novo"
    assert project.key == "ACMELTDA"


def test_ganhar_e_idempotente_na_criacao_do_projeto(scenario):
    ws = scenario["workspace"]
    deal = _deal(scenario)
    client = scenario["client"]
    first = client.post(
        f"/api/sales/deals/{deal.id}/win/", {"create_delivery_project": True}, format="json"
    )
    second = client.post(
        f"/api/sales/deals/{deal.id}/win/", {"create_delivery_project": True}, format="json"
    )
    assert first.status_code == second.status_code == 200
    assert second.json()["deal"]["created_delivery_project"] is False
    assert second.json()["deal"]["delivery_project_id"] == first.json()["deal"]["delivery_project_id"]
    assert second.json()["warning"]
    assert ProjectModel.objects.filter(workspace=ws).count() == 1
    # Histórico do ganho gravado só uma vez
    assert DealHistoryModel.objects.filter(deal=deal, field="status").count() == 1


def test_chaves_de_projeto_colidentes_recebem_sufixo(scenario):
    """Dois negócios do mesmo cliente geram chaves distintas no workspace."""
    client = scenario["client"]
    a = _deal(scenario, title="Fase 1")
    b = _deal(scenario, title="Fase 2")
    key_a = ProjectModel.objects.get(
        id=client.post(
            f"/api/sales/deals/{a.id}/win/", {"create_delivery_project": True}, format="json"
        ).json()["deal"]["delivery_project_id"]
    ).key
    key_b = ProjectModel.objects.get(
        id=client.post(
            f"/api/sales/deals/{b.id}/win/", {"create_delivery_project": True}, format="json"
        ).json()["deal"]["delivery_project_id"]
    ).key
    assert key_a != key_b


# ── Perder ───────────────────────────────────────────────────────────────────

def test_perder_sem_motivo_falha(scenario):
    deal = _deal(scenario)
    resp = scenario["client"].post(f"/api/sales/deals/{deal.id}/lose/", {}, format="json")
    assert resp.status_code == 400
    deal.refresh_from_db()
    assert deal.lost_at is None


def test_perder_com_motivo(scenario):
    ws = scenario["workspace"]
    deal = _deal(scenario)
    resp = scenario["client"].post(
        f"/api/sales/deals/{deal.id}/lose/",
        {"lost_reason": "Preço", "lost_notes": "Concorrente mais barato"},
        format="json",
    )
    assert resp.status_code == 200
    body = resp.json()["deal"]
    assert body["lost_at"] is not None
    assert body["lost_reason"] == "Preço"
    assert body["stage_id"] == str(_stage(ws, "perdido").id)
    assert body["probability"] == 0


# ── Atividades ───────────────────────────────────────────────────────────────

def test_agendar_reuniao_sem_google_conectado_nao_bloqueia(scenario):
    """Sem conta Google, a reunião é criada sem evento e a resposta traz o aviso."""
    deal = _deal(scenario)
    start = datetime.now(UTC) + timedelta(days=1)
    resp = scenario["client"].post(
        f"/api/sales/deals/{deal.id}/activities/",
        {
            "kind": "meeting",
            "content": "Call de descoberta",
            "due_date": start.isoformat(),
        },
        format="json",
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["activity"]["google_event_id"] == ""
    assert body["warning"]
    assert DealActivityModel.objects.filter(deal=deal, kind="meeting").count() == 1


def test_reuniao_exige_data_de_inicio(scenario):
    deal = _deal(scenario)
    resp = scenario["client"].post(
        f"/api/sales/deals/{deal.id}/activities/",
        {"kind": "meeting", "content": "Sem data"},
        format="json",
    )
    assert resp.status_code == 400


def test_tarefa_com_prazo_e_responsavel_e_conclusao(scenario):
    deal = _deal(scenario)
    due = datetime.now(UTC) + timedelta(days=2)
    created = scenario["client"].post(
        f"/api/sales/deals/{deal.id}/activities/",
        {
            "kind": "task",
            "content": "Enviar proposta",
            "due_date": due.isoformat(),
            "assignee_id": str(scenario["owner"].id),
        },
        format="json",
    )
    assert created.status_code == 201
    assert created.json()["activity"]["assignee_id"] == str(scenario["owner"].id)

    activity_id = created.json()["activity"]["id"]
    done = scenario["client"].patch(
        f"/api/sales/activities/{activity_id}/", {"done": True}, format="json"
    )
    assert done.status_code == 200
    assert done.json()["done_at"] is not None


# ── Negócios, clientes e permissões ──────────────────────────────────────────

def test_criar_negocio_herda_probabilidade_do_estagio(scenario):
    ws = scenario["workspace"]
    resp = scenario["client"].post(
        "/api/sales/deals/",
        {
            "workspace_id": str(ws.id),
            "title": "Contrato anual",
            "customer_id": str(scenario["customer"].id),
            "amount": "25000.00",
        },
        format="json",
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["stage_id"] == str(_stage(ws, "lead").id)
    assert body["probability"] == 10
    assert body["weighted_amount"] == "2500.00"
    # Nome do cliente vem denormalizado para o card do Kanban
    assert body["customer_name"] == "Acme Ltda"


def test_valor_negativo_e_rejeitado(scenario):
    ws = scenario["workspace"]
    resp = scenario["client"].post(
        "/api/sales/deals/",
        {
            "workspace_id": str(ws.id),
            "title": "Inválido",
            "customer_id": str(scenario["customer"].id),
            "amount": "-1.00",
        },
        format="json",
    )
    assert resp.status_code == 400


def test_resumo_do_funil_soma_valor_e_ponderado(scenario):
    ws = scenario["workspace"]
    _deal(scenario, amount=Decimal("10000.00"), probability=10)
    _deal(scenario, amount=Decimal("30000.00"), probability=50, stage=_stage(ws, "proposta"))
    resp = scenario["client"].get(f"/api/sales/pipeline/summary/?workspace_id={ws.id}")
    assert resp.status_code == 200
    by_slug = {row["name"]: row for row in resp.json()}
    assert by_slug["Lead"]["count"] == 1
    assert Decimal(by_slug["Lead"]["weighted_amount"]) == Decimal("1000.00")
    assert Decimal(by_slug["Proposta"]["weighted_amount"]) == Decimal("15000.00")


def test_negocio_invisivel_para_quem_nao_e_membro(scenario):
    deal = _deal(scenario)
    other = APIClient()
    other.force_authenticate(user=scenario["outsider"])
    assert other.get(f"/api/sales/deals/{deal.id}/").status_code == 403
    assert other.post(
        f"/api/sales/deals/{deal.id}/win/", {}, format="json"
    ).status_code == 403


def test_cliente_invisivel_para_quem_nao_e_membro(scenario):
    other = APIClient()
    other.force_authenticate(user=scenario["outsider"])
    resp = other.get(f"/api/sales/customers/{scenario['customer'].id}/")
    assert resp.status_code == 403
    assert resp.json()["error"]


def test_crud_de_cliente_e_contato(scenario):
    ws = scenario["workspace"]
    client = scenario["client"]
    created = client.post(
        "/api/sales/customers/",
        {"workspace_id": str(ws.id), "name": "Beta SA", "kind": "company", "document": "123"},
        format="json",
    )
    assert created.status_code == 201
    customer_id = created.json()["id"]

    renamed = client.patch(
        f"/api/sales/customers/{customer_id}/", {"name": "Beta S.A."}, format="json"
    )
    assert renamed.json()["name"] == "Beta S.A."

    contact = client.post(
        f"/api/sales/customers/{customer_id}/contacts/",
        {"name": "Joana", "role": "CTO", "is_primary": True},
        format="json",
    )
    assert contact.status_code == 201
    assert contact.json()["is_primary"] is True

    listed = client.get(f"/api/sales/customers/{customer_id}/contacts/")
    assert [c["name"] for c in listed.json()] == ["Joana"]

    assert client.delete(f"/api/sales/contacts/{contact.json()['id']}/").status_code == 204


def test_listar_negocios_exige_workspace_id(scenario):
    resp = scenario["client"].get("/api/sales/deals/")
    assert resp.status_code == 400
    assert resp.json() == {"error": "Informe o parâmetro workspace_id."}


def test_lista_agregada_de_atividades_do_workspace(scenario):
    """A aba Atividades lê todas as atividades do workspace, com filtros."""
    ws = scenario["workspace"]
    client = scenario["client"]
    deal = _deal(scenario)
    due = datetime.now(UTC) + timedelta(days=1)
    client.post(
        f"/api/sales/deals/{deal.id}/activities/",
        {"kind": "note", "content": "Ligou hoje"},
        format="json",
    )
    task = client.post(
        f"/api/sales/deals/{deal.id}/activities/",
        {
            "kind": "task",
            "content": "Follow-up",
            "due_date": due.isoformat(),
            "assignee_id": str(scenario["owner"].id),
        },
        format="json",
    ).json()["activity"]

    todas = client.get(f"/api/sales/activities/?workspace_id={ws.id}")
    assert todas.status_code == 200
    assert len(todas.json()) == 2

    pendentes = client.get(
        f"/api/sales/activities/?workspace_id={ws.id}&kind=task&pending=true"
    )
    assert [a["id"] for a in pendentes.json()] == [task["id"]]

    other = APIClient()
    other.force_authenticate(user=scenario["outsider"])
    assert other.get(f"/api/sales/activities/?workspace_id={ws.id}").status_code == 403


def test_atividade_expoe_autor_e_negocio_para_exibicao(scenario):
    """O feed precisa dizer de qual negócio e de quem é a atividade.

    São campos desnormalizados: sem eles o "Meu Dia" e a aba Atividades
    mostram a tarefa solta, sem o contexto que o vendedor usa para agir.
    """
    ws = scenario["workspace"]
    client = scenario["client"]
    deal = _deal(scenario)
    client.post(
        f"/api/sales/deals/{deal.id}/activities/",
        {"kind": "note", "content": "Ligou hoje"},
        format="json",
    )

    atividade = client.get(f"/api/sales/activities/?workspace_id={ws.id}").json()[0]
    assert atividade["deal_title"] == deal.title
    assert atividade["author_name"] == scenario["owner"].full_name
