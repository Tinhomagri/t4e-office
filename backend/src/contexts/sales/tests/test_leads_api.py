"""Testes da API de leads: captação, importação CSV, esteira e conversão.

Funções soltas, não classes: o restante da suíte do contexto (test_pipeline,
test_proposals_api) segue esse padrão, e agrupar em `class Test...:` aciona um
bug de finalizer no pytest-django instalado (`assert not self._finalizers`).
"""
import pytest
from rest_framework.test import APIClient

from contexts.identity.infrastructure.django.models import (
    MembershipModel,
    UserModel,
    WorkspaceModel,
)
from contexts.sales.application.use_cases.seed_default_stages import SeedDefaultStages
from contexts.sales.infrastructure.django.models import CustomerModel, DealModel, LeadModel
from contexts.sales.infrastructure.django.repositories_impl import DjangoStageRepository


@pytest.fixture
def scenario(db):
    """Workspace com dono e funil padrão semeado — necessário para converter lead em negócio."""
    owner = UserModel.objects.create_user(
        email="comercial@t4e.com", password="x", full_name="Comercial", is_active=True
    )
    outsider = UserModel.objects.create_user(
        email="fora@t4e.com", password="x", full_name="Fora", is_active=True
    )
    ws = WorkspaceModel.objects.create(name="WS", slug="ws-leads", owner=owner)
    MembershipModel.objects.create(workspace=ws, user=owner, role="owner")
    SeedDefaultStages(DjangoStageRepository()).execute(workspace_id=str(ws.id))

    client = APIClient()
    client.force_authenticate(user=owner)
    outsider_client = APIClient()
    outsider_client.force_authenticate(user=outsider)
    return {
        "owner": owner,
        "outsider": outsider,
        "workspace": ws,
        "client": client,
        "outsider_client": outsider_client,
    }


def _create_lead(scenario, **overrides) -> dict:
    payload = {"workspace_id": str(scenario["workspace"].id), "name": "Ana Beatriz"}
    payload.update(overrides)
    resp = scenario["client"].post("/api/sales/leads/", payload, format="json")
    assert resp.status_code == 201, resp.data
    return resp.data


# ── Captação ─────────────────────────────────────────────────────────────────

def test_cria_lead_manual(scenario):
    body = _create_lead(scenario, company="Acme", email="ana@acme.com")
    assert body["name"] == "Ana Beatriz"
    assert body["status"] == "new"
    assert body["source"] == "manual"
    assert body["first_contact_due_at"] is not None


def test_nome_vazio_e_rejeitado(scenario):
    resp = scenario["client"].post(
        "/api/sales/leads/",
        {"workspace_id": str(scenario["workspace"].id), "name": ""},
        format="json",
    )
    assert resp.status_code == 400


def test_lista_por_workspace(scenario):
    _create_lead(scenario, name="Ana")
    _create_lead(scenario, name="Bruno")
    resp = scenario["client"].get(f"/api/sales/leads/?workspace_id={scenario['workspace'].id}")
    assert resp.status_code == 200
    assert len(resp.data) == 2


def test_outsider_nao_ve_leads_do_workspace(scenario):
    _create_lead(scenario)
    resp = scenario["outsider_client"].get(
        f"/api/sales/leads/?workspace_id={scenario['workspace'].id}"
    )
    # ListLeads chama assert_workspace_member como todo caso de uso do
    # contexto — quem não é membro é barrado antes de a query rodar.
    assert resp.status_code == 403


# ── Importação CSV ───────────────────────────────────────────────────────────

def test_importa_linhas_validas(scenario):
    csv_text = "name,company,email,phone,source\nCarla,Beta Ltda,carla@beta.com,11999,site\nDaniel,,daniel@x.com,,evento\n"
    resp = scenario["client"].post(
        "/api/sales/leads/import/",
        {"workspace_id": str(scenario["workspace"].id), "csv_text": csv_text},
        format="json",
    )
    assert resp.status_code == 201, resp.data
    assert len(resp.data["imported"]) == 2
    assert resp.data["errors"] == []
    assert resp.data["imported"][0]["name"] == "Carla"
    assert resp.data["imported"][0]["source"] == "site"


def test_linha_sem_nome_vira_erro_sem_derrubar_as_outras(scenario):
    csv_text = "name,email\nEduarda,edu@x.com\n,semnome@x.com\nFelipe,felipe@x.com\n"
    resp = scenario["client"].post(
        "/api/sales/leads/import/",
        {"workspace_id": str(scenario["workspace"].id), "csv_text": csv_text},
        format="json",
    )
    assert resp.status_code == 201
    assert len(resp.data["imported"]) == 2
    assert len(resp.data["errors"]) == 1
    assert resp.data["errors"][0]["row"] == 3


def test_linha_sem_source_ganha_csv_import(scenario):
    csv_text = "name\nGabriel\n"
    resp = scenario["client"].post(
        "/api/sales/leads/import/",
        {"workspace_id": str(scenario["workspace"].id), "csv_text": csv_text},
        format="json",
    )
    assert resp.data["imported"][0]["source"] == "csv_import"


def test_csv_vazio_nao_importa_nada(scenario):
    resp = scenario["client"].post(
        "/api/sales/leads/import/",
        {"workspace_id": str(scenario["workspace"].id), "csv_text": "name,email\n"},
        format="json",
    )
    assert resp.status_code == 201
    assert resp.data["imported"] == []


# ── Esteira de qualificação ──────────────────────────────────────────────────

def test_marcar_contatado_encerra_sla(scenario):
    lead = _create_lead(scenario)
    resp = scenario["client"].post(f"/api/sales/leads/{lead['id']}/contacted/")
    assert resp.status_code == 200
    assert resp.data["contacted_at"] is not None
    assert resp.data["status"] == "contacted"


def test_qualificar_com_score(scenario):
    lead = _create_lead(scenario)
    resp = scenario["client"].post(
        f"/api/sales/leads/{lead['id']}/qualify/", {"score": 85}, format="json"
    )
    assert resp.status_code == 200
    assert resp.data["score"] == 85
    assert resp.data["status"] == "qualified"


def test_score_fora_do_intervalo_e_rejeitado(scenario):
    lead = _create_lead(scenario)
    resp = scenario["client"].post(
        f"/api/sales/leads/{lead['id']}/qualify/", {"score": 150}, format="json"
    )
    assert resp.status_code == 400


def test_desqualificar_exige_motivo(scenario):
    lead = _create_lead(scenario)
    resp = scenario["client"].post(
        f"/api/sales/leads/{lead['id']}/disqualify/", {"reason": ""}, format="json"
    )
    assert resp.status_code == 400


def test_desqualificar_com_motivo(scenario):
    lead = _create_lead(scenario)
    resp = scenario["client"].post(
        f"/api/sales/leads/{lead['id']}/disqualify/",
        {"reason": "Sem orçamento este ano"},
        format="json",
    )
    assert resp.status_code == 200
    assert resp.data["status"] == "disqualified"
    assert resp.data["disqualify_reason"] == "Sem orçamento este ano"


def test_filtro_por_status(scenario):
    a = _create_lead(scenario, name="A")
    _create_lead(scenario, name="B")
    scenario["client"].post(f"/api/sales/leads/{a['id']}/qualify/", {"score": 70}, format="json")
    resp = scenario["client"].get(
        f"/api/sales/leads/?workspace_id={scenario['workspace'].id}&status=qualified"
    )
    assert len(resp.data) == 1
    assert resp.data[0]["id"] == a["id"]


# ── Conversão ─────────────────────────────────────────────────────────────────

def test_converte_lead_em_cliente_e_negocio(scenario):
    lead = _create_lead(scenario, company="Delta Corp", email="d@delta.com")
    resp = scenario["client"].post(
        f"/api/sales/leads/{lead['id']}/convert/",
        {"deal_title": "Projeto Delta", "amount": "5000"},
        format="json",
    )
    assert resp.status_code == 200, resp.data
    assert resp.data["lead"]["status"] == "converted"
    assert CustomerModel.objects.filter(id=resp.data["customer_id"]).exists()
    deal = DealModel.objects.get(id=resp.data["deal_id"])
    assert deal.title == "Projeto Delta"
    assert str(deal.amount) == "5000.00"


def test_cliente_gerado_usa_nome_da_empresa_quando_existe(scenario):
    lead = _create_lead(scenario, company="Empresa X", name="Contato Y")
    resp = scenario["client"].post(f"/api/sales/leads/{lead['id']}/convert/", {}, format="json")
    customer = CustomerModel.objects.get(id=resp.data["customer_id"])
    assert customer.name == "Empresa X"
    assert customer.kind == "company"


def test_lead_sem_empresa_gera_cliente_pessoa_fisica_com_o_proprio_nome(scenario):
    lead = _create_lead(scenario, name="Contato Solo", company="")
    resp = scenario["client"].post(f"/api/sales/leads/{lead['id']}/convert/", {}, format="json")
    customer = CustomerModel.objects.get(id=resp.data["customer_id"])
    assert customer.name == "Contato Solo"
    assert customer.kind == "person"


def test_nao_reconverte_lead_ja_convertido(scenario):
    lead = _create_lead(scenario)
    scenario["client"].post(f"/api/sales/leads/{lead['id']}/convert/", {}, format="json")
    resp = scenario["client"].post(f"/api/sales/leads/{lead['id']}/convert/", {}, format="json")
    assert resp.status_code == 400


def test_nao_converte_lead_desqualificado(scenario):
    lead = _create_lead(scenario)
    scenario["client"].post(
        f"/api/sales/leads/{lead['id']}/disqualify/", {"reason": "Fora do perfil"}, format="json"
    )
    resp = scenario["client"].post(f"/api/sales/leads/{lead['id']}/convert/", {}, format="json")
    assert resp.status_code == 400


def test_deal_gerado_entra_no_primeiro_estagio_do_funil(scenario):
    lead = _create_lead(scenario)
    resp = scenario["client"].post(f"/api/sales/leads/{lead['id']}/convert/", {}, format="json")
    deal = DealModel.objects.get(id=resp.data["deal_id"])
    assert deal.stage.order == min(s.order for s in deal.workspace.pipeline_stages.all())


# ── Acesso e exclusão ────────────────────────────────────────────────────────

def test_detalhe_de_lead_de_outro_workspace_e_negado(scenario):
    lead = _create_lead(scenario)
    resp = scenario["outsider_client"].get(f"/api/sales/leads/{lead['id']}/")
    assert resp.status_code == 403


def test_remove_lead(scenario):
    lead = _create_lead(scenario)
    resp = scenario["client"].delete(f"/api/sales/leads/{lead['id']}/")
    assert resp.status_code == 204
    assert not LeadModel.objects.filter(id=lead["id"]).exists()


def test_atualiza_dados_de_contato(scenario):
    lead = _create_lead(scenario)
    resp = scenario["client"].patch(
        f"/api/sales/leads/{lead['id']}/", {"phone": "11988887777"}, format="json"
    )
    assert resp.status_code == 200
    assert resp.data["phone"] == "11988887777"
