"""Testes de API das propostas — do request ao PDF, sem mock do gerador.

O PDF é gerado de verdade (ReportLab é local e rápido); só o SMTP é
interceptado. Assim um erro de layout ou de escape estoura aqui, não na frente
do cliente.
"""
from unittest.mock import patch

import pytest
from rest_framework.test import APIClient

from contexts.identity.infrastructure.django.models import (
    MembershipModel,
    UserModel,
    WorkspaceModel,
)
from contexts.sales.application.use_cases.seed_default_stages import SeedDefaultStages
from contexts.sales.infrastructure.django.models import (
    CustomerModel,
    DealModel,
    PipelineStageModel,
    ProposalModel,
)
from contexts.sales.infrastructure.django.repositories_impl import DjangoStageRepository


@pytest.fixture
def scenario(db):
    owner = UserModel.objects.create_user(
        email="vendedor@t4e.com", password="x", full_name="Vendedor", is_active=True
    )
    outsider = UserModel.objects.create_user(
        email="fora@t4e.com", password="x", full_name="Fora", is_active=True
    )
    ws = WorkspaceModel.objects.create(name="T4E Group", slug="ws-prop", owner=owner)
    MembershipModel.objects.create(workspace=ws, user=owner, role="owner")
    SeedDefaultStages(DjangoStageRepository()).execute(workspace_id=str(ws.id))

    customer = CustomerModel.objects.create(workspace=ws, name="Acme Ltda", kind="company")
    stage = PipelineStageModel.objects.filter(workspace=ws, kind="open").first()
    deal = DealModel.objects.create(
        workspace=ws, title="Implantação ERP", customer=customer, stage=stage
    )

    client = APIClient()
    client.force_authenticate(user=owner)
    return {
        "owner": owner,
        "outsider": outsider,
        "workspace": ws,
        "ws_id": str(ws.id),
        "deal": deal,
        "customer": customer,
        "client": client,
    }


def _create(scenario, **overrides):
    payload = {
        "workspace_id": scenario["ws_id"],
        "deal_id": str(scenario["deal"].id),
        "title": "Proposta de implantação",
        "items": [
            {"description": "Consultoria", "quantity": "10", "unit_price": "250.00"},
            {"description": "Licença anual", "quantity": "1", "unit_price": "1200.00"},
        ],
    }
    payload.update(overrides)
    return scenario["client"].post("/api/sales/proposals/", payload, format="json")


# ── Criação ──────────────────────────────────────────────────────────────────
def test_criar_proposta_calcula_os_totais(scenario):
    resp = _create(scenario)
    assert resp.status_code == 201, resp.content
    body = resp.json()
    assert body["subtotal"] == "3700.00"  # 10×250 + 1×1200
    assert body["total"] == "3700.00"
    assert body["status"] == "draft"
    assert body["number"] == 1
    assert len(body["items"]) == 2


def test_numero_da_proposta_e_sequencial_por_workspace(scenario):
    assert _create(scenario).json()["number"] == 1
    assert _create(scenario).json()["number"] == 2


def test_proposta_herda_titulo_do_negocio_quando_omitido(scenario):
    resp = _create(scenario, title="")
    assert resp.json()["title"] == "Implantação ERP"


def test_proposta_traz_cliente_e_negocio_para_o_cabecalho(scenario):
    body = _create(scenario).json()
    assert body["customer_name"] == "Acme Ltda"
    assert body["deal_title"] == "Implantação ERP"


def test_desconto_entra_no_total(scenario):
    body = _create(scenario, discount="700.00").json()
    assert body["subtotal"] == "3700.00"
    assert body["total"] == "3000.00"


def test_desconto_maior_que_subtotal_e_recusado(scenario):
    resp = _create(scenario, discount="99999.00")
    assert resp.status_code == 400


def test_item_com_quantidade_zero_e_recusado(scenario):
    resp = _create(
        scenario, items=[{"description": "X", "quantity": "0", "unit_price": "10"}]
    )
    assert resp.status_code == 400


def test_negocio_de_outro_workspace_e_recusado(scenario):
    outra = WorkspaceModel.objects.create(
        name="Outra", slug="ws-outra", owner=scenario["outsider"]
    )
    SeedDefaultStages(DjangoStageRepository()).execute(workspace_id=str(outra.id))
    cliente = CustomerModel.objects.create(workspace=outra, name="X", kind="company")
    stage = PipelineStageModel.objects.filter(workspace=outra).first()
    alheio = DealModel.objects.create(
        workspace=outra, title="Alheio", customer=cliente, stage=stage
    )
    resp = _create(scenario, deal_id=str(alheio.id))
    assert resp.status_code == 404


def test_estranho_nao_lista_propostas(scenario):
    _create(scenario)
    client = APIClient()
    client.force_authenticate(user=scenario["outsider"])
    resp = client.get("/api/sales/proposals/", {"workspace_id": scenario["ws_id"]})
    assert resp.status_code == 403


# ── Edição ───────────────────────────────────────────────────────────────────
def test_editar_itens_recalcula_o_total(scenario):
    proposal_id = _create(scenario).json()["id"]
    resp = scenario["client"].patch(
        f"/api/sales/proposals/{proposal_id}/",
        {"items": [{"description": "Só consultoria", "quantity": "2", "unit_price": "500"}]},
        format="json",
    )
    assert resp.status_code == 200, resp.content
    body = resp.json()
    assert len(body["items"]) == 1
    assert body["total"] == "1000.00"


def test_editar_so_o_cabecalho_preserva_os_itens(scenario):
    proposal_id = _create(scenario).json()["id"]
    resp = scenario["client"].patch(
        f"/api/sales/proposals/{proposal_id}/", {"title": "Novo título"}, format="json"
    )
    assert resp.status_code == 200
    assert resp.json()["title"] == "Novo título"
    assert len(resp.json()["items"]) == 2
    assert resp.json()["total"] == "3700.00"


# ── PDF ──────────────────────────────────────────────────────────────────────
def test_pdf_e_gerado_de_verdade(scenario):
    proposal_id = _create(scenario).json()["id"]
    resp = scenario["client"].get(f"/api/sales/proposals/{proposal_id}/pdf/")
    assert resp.status_code == 200
    assert resp["Content-Type"] == "application/pdf"
    # Assinatura de arquivo PDF — prova que saiu um documento, não um stub.
    assert resp.content.startswith(b"%PDF-")
    assert len(resp.content) > 1000


def test_pdf_sobrevive_a_caractere_de_markup_na_descricao(scenario):
    """`&` e `<` viram markup no ReportLab e derrubariam a geração."""
    proposal_id = _create(
        scenario,
        items=[{"description": "P&D <urgente>", "quantity": "1", "unit_price": "10"}],
    ).json()["id"]
    resp = scenario["client"].get(f"/api/sales/proposals/{proposal_id}/pdf/")
    assert resp.status_code == 200
    assert resp.content.startswith(b"%PDF-")


def test_pdf_de_proposta_vazia_nao_quebra(scenario):
    proposal_id = _create(scenario, items=[]).json()["id"]
    resp = scenario["client"].get(f"/api/sales/proposals/{proposal_id}/pdf/")
    assert resp.status_code == 200
    assert resp.content.startswith(b"%PDF-")


# ── Envio ────────────────────────────────────────────────────────────────────
def test_enviar_anexa_o_pdf_e_marca_como_enviada(scenario):
    proposal_id = _create(scenario).json()["id"]
    with patch("django.core.mail.EmailMessage.send") as send:
        resp = scenario["client"].post(
            f"/api/sales/proposals/{proposal_id}/send/",
            {"to_email": "cliente@acme.com"},
            format="json",
        )
    assert resp.status_code == 200, resp.content
    send.assert_called_once()
    body = resp.json()
    assert body["status"] == "sent"
    assert body["sent_to"] == "cliente@acme.com"
    assert body["sent_at"]


def test_enviar_proposta_sem_item_e_recusado(scenario):
    proposal_id = _create(scenario, items=[]).json()["id"]
    with patch("django.core.mail.EmailMessage.send") as send:
        resp = scenario["client"].post(
            f"/api/sales/proposals/{proposal_id}/send/",
            {"to_email": "cliente@acme.com"},
            format="json",
        )
    assert resp.status_code == 400
    send.assert_not_called()


def test_falha_no_smtp_nao_marca_como_enviada(scenario):
    """Gravar `sent` sem o e-mail sair faria a tela mentir para o vendedor."""
    proposal_id = _create(scenario).json()["id"]
    with patch("django.core.mail.EmailMessage.send", side_effect=OSError("smtp fora")):
        resp = scenario["client"].post(
            f"/api/sales/proposals/{proposal_id}/send/",
            {"to_email": "cliente@acme.com"},
            format="json",
        )
    assert resp.status_code == 502
    assert ProposalModel.objects.get(id=proposal_id).status == "draft"


# ── Aceite e recusa ──────────────────────────────────────────────────────────
def _send(scenario, proposal_id):
    with patch("django.core.mail.EmailMessage.send"):
        scenario["client"].post(
            f"/api/sales/proposals/{proposal_id}/send/",
            {"to_email": "cliente@acme.com"},
            format="json",
        )


def test_aceite_sugere_ganhar_o_negocio_sem_ganhar_sozinho(scenario):
    proposal_id = _create(scenario).json()["id"]
    _send(scenario, proposal_id)

    resp = scenario["client"].post(f"/api/sales/proposals/{proposal_id}/accept/")
    assert resp.status_code == 200, resp.content
    body = resp.json()
    assert body["proposal"]["status"] == "accepted"

    sugestao = body["suggestion"]
    assert sugestao["action"] == "win_deal"
    assert sugestao["deal_id"] == str(scenario["deal"].id)
    # O valor da proposta preenche o valor do negócio ao ganhar.
    assert sugestao["amount"] == "3700.00"

    # Decisão de produto: NÃO ganha o deal automaticamente.
    scenario["deal"].refresh_from_db()
    assert scenario["deal"].won_at is None


def test_negocio_ja_ganho_nao_recebe_sugestao(scenario):
    from django.utils import timezone

    scenario["deal"].won_at = timezone.now()
    scenario["deal"].save(update_fields=["won_at"])

    proposal_id = _create(scenario).json()["id"]
    _send(scenario, proposal_id)
    resp = scenario["client"].post(f"/api/sales/proposals/{proposal_id}/accept/")
    assert resp.json()["suggestion"] is None


def test_nao_aceita_rascunho_nunca_enviado(scenario):
    proposal_id = _create(scenario).json()["id"]
    resp = scenario["client"].post(f"/api/sales/proposals/{proposal_id}/accept/")
    assert resp.status_code == 409


def test_proposta_aceita_nao_pode_mais_ser_editada(scenario):
    proposal_id = _create(scenario).json()["id"]
    _send(scenario, proposal_id)
    scenario["client"].post(f"/api/sales/proposals/{proposal_id}/accept/")

    resp = scenario["client"].patch(
        f"/api/sales/proposals/{proposal_id}/", {"title": "Mudando"}, format="json"
    )
    assert resp.status_code == 409


def test_proposta_aceita_nao_pode_ser_excluida(scenario):
    proposal_id = _create(scenario).json()["id"]
    _send(scenario, proposal_id)
    scenario["client"].post(f"/api/sales/proposals/{proposal_id}/accept/")

    resp = scenario["client"].delete(f"/api/sales/proposals/{proposal_id}/")
    assert resp.status_code == 400


def test_recusa_registra_o_motivo(scenario):
    proposal_id = _create(scenario).json()["id"]
    _send(scenario, proposal_id)
    resp = scenario["client"].post(
        f"/api/sales/proposals/{proposal_id}/reject/",
        {"reason": "Preço acima do orçamento"},
        format="json",
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "rejected"
    assert resp.json()["rejection_reason"] == "Preço acima do orçamento"


def test_rascunho_pode_ser_excluido(scenario):
    proposal_id = _create(scenario).json()["id"]
    resp = scenario["client"].delete(f"/api/sales/proposals/{proposal_id}/")
    assert resp.status_code == 204
    assert not ProposalModel.objects.filter(id=proposal_id).exists()


# ── Listagem ─────────────────────────────────────────────────────────────────
def test_listar_filtra_por_negocio(scenario):
    _create(scenario)
    outro_deal = DealModel.objects.create(
        workspace=scenario["workspace"],
        title="Outro projeto",
        customer=scenario["customer"],
        stage=PipelineStageModel.objects.filter(workspace=scenario["workspace"]).first(),
    )
    _create(scenario, deal_id=str(outro_deal.id))

    resp = scenario["client"].get(
        "/api/sales/proposals/",
        {"workspace_id": scenario["ws_id"], "deal_id": str(outro_deal.id)},
    )
    assert resp.status_code == 200
    assert len(resp.json()) == 1
    assert resp.json()[0]["deal_title"] == "Outro projeto"


def test_listar_sem_workspace_id_falha(scenario):
    assert scenario["client"].get("/api/sales/proposals/").status_code == 400
