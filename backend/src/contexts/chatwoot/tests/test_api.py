"""Testes de API do atendimento — exercitam a view real, do request à resposta.

Os testes de caso de uso usam um gateway falso e não pegam erro de fiação:
rota errada, serializer que não bate, permissão trocada. Aqui só o HTTP de
saída (httpx) é interceptado; todo o resto é o caminho de produção.
"""
from unittest.mock import patch

import pytest
from rest_framework.test import APIClient

from contexts.chatwoot.infrastructure.django.models import (
    ChatwootConnectionModel,
    ConversationLinkModel,
)
from contexts.identity.infrastructure.django.models import (
    MembershipModel,
    UserModel,
    WorkspaceModel,
)
from contexts.sales.application.use_cases.seed_default_stages import SeedDefaultStages
from contexts.sales.infrastructure.django.models import CustomerModel, DealModel
from contexts.sales.infrastructure.django.repositories_impl import DjangoStageRepository


@pytest.fixture
def scenario(db):
    """Workspace com dono (admin), um membro comum e um estranho."""
    owner = UserModel.objects.create_user(
        email="dono@t4e.com", password="x", full_name="Dono", is_active=True
    )
    member = UserModel.objects.create_user(
        email="agente@t4e.com", password="x", full_name="Agente", is_active=True
    )
    outsider = UserModel.objects.create_user(
        email="fora@t4e.com", password="x", full_name="Fora", is_active=True
    )
    ws = WorkspaceModel.objects.create(name="WS", slug="ws-cw", owner=owner)
    MembershipModel.objects.create(workspace=ws, user=owner, role="owner")
    MembershipModel.objects.create(workspace=ws, user=member, role="member")

    client = APIClient()
    client.force_authenticate(user=owner)
    return {
        "owner": owner,
        "member": member,
        "outsider": outsider,
        "workspace": ws,
        "ws_id": str(ws.id),
        "client": client,
    }


@pytest.fixture
def connected(scenario):
    """Conexão já salva e marcada como válida."""
    from contexts.chatwoot.infrastructure.django.crypto import encrypt

    ChatwootConnectionModel.objects.create(
        workspace=scenario["workspace"],
        base_url="https://chat.t4e.com.br",
        account_id=2,
        access_token_encrypted=encrypt("token-valido"),
        webhook_secret="segredo-webhook",
        status="connected",
    )
    return scenario


class FakeResponse:
    """Resposta httpx mínima — o gateway só usa estes atributos."""

    def __init__(self, payload, status_code=200):
        self._payload = payload
        self.status_code = status_code
        self.content = b"{}" if payload is not None else b""
        self.text = str(payload)

    def json(self):
        return self._payload


# ── Conexão ──────────────────────────────────────────────────────────────────
def test_get_connection_sem_conexao_devolve_estado_vazio(scenario):
    resp = scenario["client"].get("/api/chatwoot/connection/", {"workspace_id": scenario["ws_id"]})
    assert resp.status_code == 200
    assert resp.json() == {"connected": False, "connection": None}


def test_conectar_valida_o_token_e_persiste(scenario):
    with patch("httpx.request") as http:
        http.return_value = FakeResponse({"name": "Ana", "email": "ana@t4e.com"})
        resp = scenario["client"].post(
            "/api/chatwoot/connection/",
            {
                "workspace_id": scenario["ws_id"],
                "base_url": "https://chat.t4e.com.br",
                "account_id": 2,
                "access_token": "tok-123",
            },
            format="json",
        )

    assert resp.status_code == 201, resp.content
    body = resp.json()
    assert body["status"] == "connected"
    assert body["agent_name"] == "Ana"
    # O token nunca volta no corpo — só o indicador de que existe.
    assert "access_token" not in body
    assert body["has_token"] is True


def test_conectar_bate_no_endpoint_de_perfil_do_chatwoot(scenario):
    """A URL de verificação é `/api/v1/profile`, fora do escopo da conta."""
    with patch("httpx.request") as http:
        http.return_value = FakeResponse({"name": "Ana"})
        scenario["client"].post(
            "/api/chatwoot/connection/",
            {
                "workspace_id": scenario["ws_id"],
                "base_url": "https://chat.t4e.com.br",
                "account_id": 2,
                "access_token": "tok",
            },
            format="json",
        )
    method, url = http.call_args[0]
    assert method == "GET"
    assert url == "https://chat.t4e.com.br/api/v1/profile"
    assert http.call_args[1]["headers"]["api_access_token"] == "tok"


def test_conectar_com_token_recusado_devolve_403_e_marca_erro(scenario):
    with patch("httpx.request") as http:
        http.return_value = FakeResponse(None, status_code=401)
        resp = scenario["client"].post(
            "/api/chatwoot/connection/",
            {
                "workspace_id": scenario["ws_id"],
                "base_url": "https://chat.t4e.com.br",
                "account_id": 2,
                "access_token": "ruim",
            },
            format="json",
        )

    assert resp.status_code == 403
    row = ChatwootConnectionModel.objects.get(workspace_id=scenario["ws_id"])
    assert row.status == "error"
    assert row.last_error


def test_conectar_com_instancia_fora_do_ar_devolve_502(scenario):
    import httpx

    with patch("httpx.request", side_effect=httpx.ConnectError("sem rota")):
        resp = scenario["client"].post(
            "/api/chatwoot/connection/",
            {
                "workspace_id": scenario["ws_id"],
                "base_url": "https://chat.t4e.com.br",
                "account_id": 2,
                "access_token": "tok",
            },
            format="json",
        )
    # 502: o pedido estava certo, quem caiu foi o terceiro.
    assert resp.status_code == 502


def test_membro_comum_nao_configura_a_conexao(scenario):
    """Mexer no token da instância inteira é de admin; atender é de member."""
    client = APIClient()
    client.force_authenticate(user=scenario["member"])
    resp = client.post(
        "/api/chatwoot/connection/",
        {
            "workspace_id": scenario["ws_id"],
            "base_url": "https://chat.t4e.com.br",
            "account_id": 2,
            "access_token": "tok",
        },
        format="json",
    )
    assert resp.status_code == 403


def test_estranho_nao_ve_a_conexao(connected):
    client = APIClient()
    client.force_authenticate(user=connected["outsider"])
    resp = client.get("/api/chatwoot/connection/", {"workspace_id": connected["ws_id"]})
    assert resp.status_code == 403


def test_webhook_url_e_montada_com_o_segredo(connected):
    resp = connected["client"].get(
        "/api/chatwoot/connection/", {"workspace_id": connected["ws_id"]}
    )
    url = resp.json()["connection"]["webhook_url"]
    assert url.endswith("/api/chatwoot/webhook/segredo-webhook/")


def test_listar_sem_workspace_id_falha_com_400(scenario):
    resp = scenario["client"].get("/api/chatwoot/conversations/")
    assert resp.status_code == 400


def test_operar_sem_conexao_configurada_devolve_404_explicativo(scenario):
    resp = scenario["client"].get(
        "/api/chatwoot/conversations/", {"workspace_id": scenario["ws_id"]}
    )
    assert resp.status_code == 404
    assert "Chatwoot" in resp.json()["error"]


# ── Conversas ────────────────────────────────────────────────────────────────
CONVERSATION_PAYLOAD = {
    "data": {
        "meta": {"mine_count": 1, "unassigned_count": 2, "all_count": 3},
        "payload": [
            {
                "id": 7,
                "inbox_id": 1,
                "status": "open",
                "unread_count": 2,
                "labels": ["vip"],
                "created_at": 1753600000,
                "last_activity_at": 1753600500,
                "meta": {
                    "sender": {"id": 55, "name": "Cliente Alfa", "email": "alfa@x.com"},
                    "channel": "Channel::WebWidget",
                },
                "messages": [{"id": 1, "message_type": 0, "content": "olá"}],
            }
        ],
    }
}


def test_listar_conversas_normaliza_o_payload_do_chatwoot(connected):
    with patch("httpx.request") as http:
        http.return_value = FakeResponse(CONVERSATION_PAYLOAD)
        resp = connected["client"].get(
            "/api/chatwoot/conversations/",
            {"workspace_id": connected["ws_id"], "status": "open"},
        )

    assert resp.status_code == 200, resp.content
    body = resp.json()
    assert body["all_count"] == 3
    conversation = body["payload"][0]
    assert conversation["id"] == 7
    assert conversation["contact"]["name"] == "Cliente Alfa"
    # Timestamp Unix vira ISO — o frontend não deve lidar com epoch.
    assert conversation["created_at"].startswith("2025-")
    assert conversation["link"] == {}


def test_listar_conversas_anexa_o_vinculo_comercial(connected):
    ws = connected["workspace"]
    customer = CustomerModel.objects.create(workspace=ws, name="Alfa SA", kind="company")
    SeedDefaultStages(DjangoStageRepository()).execute(workspace_id=str(ws.id))
    from contexts.sales.infrastructure.django.models import PipelineStageModel

    stage = PipelineStageModel.objects.filter(workspace=ws).first()
    deal = DealModel.objects.create(
        workspace=ws, title="Contrato anual", customer=customer, stage=stage
    )
    ConversationLinkModel.objects.create(
        workspace=ws, conversation_id=7, deal=deal, customer=customer
    )

    with patch("httpx.request") as http:
        http.return_value = FakeResponse(CONVERSATION_PAYLOAD)
        resp = connected["client"].get(
            "/api/chatwoot/conversations/", {"workspace_id": connected["ws_id"]}
        )

    link = resp.json()["payload"][0]["link"]
    assert link["deal_title"] == "Contrato anual"
    assert link["customer_name"] == "Alfa SA"


def test_filtros_da_caixa_viram_query_string_do_chatwoot(connected):
    with patch("httpx.request") as http:
        http.return_value = FakeResponse(CONVERSATION_PAYLOAD)
        connected["client"].get(
            "/api/chatwoot/conversations/",
            {
                "workspace_id": connected["ws_id"],
                "status": "pending",
                "assignee_type": "me",
                "inbox_id": 4,
                "q": "orçamento",
            },
        )
    params = http.call_args[1]["params"]
    assert params["status"] == "pending"
    assert params["assignee_type"] == "me"
    assert params["inbox_id"] == 4
    assert params["q"] == "orçamento"


def test_enviar_mensagem_marca_como_outgoing(connected):
    with patch("httpx.request") as http:
        http.return_value = FakeResponse(
            {"id": 99, "message_type": 1, "content": "resposta", "created_at": 1753600000}
        )
        resp = connected["client"].post(
            "/api/chatwoot/conversations/7/messages/",
            {"workspace_id": connected["ws_id"], "content": "resposta"},
            format="json",
        )

    assert resp.status_code == 201, resp.content
    assert resp.json()["direction"] == "outgoing"
    body = http.call_args[1]["json"]
    assert body["message_type"] == "outgoing"
    assert body["private"] is False


def test_nota_interna_vai_como_private(connected):
    with patch("httpx.request") as http:
        http.return_value = FakeResponse(
            {"id": 100, "message_type": 1, "content": "nota", "private": True}
        )
        connected["client"].post(
            "/api/chatwoot/conversations/7/messages/",
            {"workspace_id": connected["ws_id"], "content": "nota", "private": True},
            format="json",
        )
    assert http.call_args[1]["json"]["private"] is True


def test_mensagem_vazia_e_recusada_sem_chamar_o_chatwoot(connected):
    with patch("httpx.request") as http:
        resp = connected["client"].post(
            "/api/chatwoot/conversations/7/messages/",
            {"workspace_id": connected["ws_id"], "content": "   "},
            format="json",
        )
    assert resp.status_code == 400
    http.assert_not_called()


def test_resolver_conversa_chama_toggle_status(connected):
    with patch("httpx.request") as http:
        http.return_value = FakeResponse({"ok": True})
        resp = connected["client"].post(
            "/api/chatwoot/conversations/7/status/",
            {"workspace_id": connected["ws_id"], "status": "resolved"},
            format="json",
        )
    assert resp.status_code == 200
    assert http.call_args[0][1].endswith("/conversations/7/toggle_status")


def test_status_invalido_e_recusado(connected):
    resp = connected["client"].post(
        "/api/chatwoot/conversations/7/status/",
        {"workspace_id": connected["ws_id"], "status": "arquivada"},
        format="json",
    )
    assert resp.status_code == 400


# ── Ponte com o funil ────────────────────────────────────────────────────────
def test_vincular_conversa_a_negocio_persiste_e_espelha(connected):
    ws = connected["workspace"]
    customer = CustomerModel.objects.create(workspace=ws, name="Beta", kind="company")
    SeedDefaultStages(DjangoStageRepository()).execute(workspace_id=str(ws.id))
    from contexts.sales.infrastructure.django.models import PipelineStageModel

    stage = PipelineStageModel.objects.filter(workspace=ws).first()
    deal = DealModel.objects.create(workspace=ws, title="Beta 2026", customer=customer, stage=stage)

    with patch("httpx.request") as http:
        http.return_value = FakeResponse({"custom_attributes": {}})
        resp = connected["client"].post(
            "/api/chatwoot/conversations/7/link/",
            {"workspace_id": connected["ws_id"], "deal_id": str(deal.id)},
            format="json",
        )

    assert resp.status_code == 201, resp.content
    body = resp.json()
    assert body["mirrored_to_chatwoot"] is True
    # O cliente do negócio é preenchido sozinho.
    assert body["customer_id"] == str(customer.id)
    assert ConversationLinkModel.objects.filter(workspace=ws, conversation_id=7).exists()


def test_vincular_negocio_de_outro_workspace_falha(connected):
    outra = WorkspaceModel.objects.create(
        name="Outra", slug="outra-cw", owner=connected["outsider"]
    )
    customer = CustomerModel.objects.create(workspace=outra, name="X", kind="company")
    SeedDefaultStages(DjangoStageRepository()).execute(workspace_id=str(outra.id))
    from contexts.sales.infrastructure.django.models import PipelineStageModel

    stage = PipelineStageModel.objects.filter(workspace=outra).first()
    deal = DealModel.objects.create(workspace=outra, title="Alheio", customer=customer, stage=stage)

    resp = connected["client"].post(
        "/api/chatwoot/conversations/7/link/",
        {"workspace_id": connected["ws_id"], "deal_id": str(deal.id)},
        format="json",
    )
    assert resp.status_code == 404


# ── Webhook ──────────────────────────────────────────────────────────────────
def test_webhook_aceita_evento_sem_autenticacao_de_usuario(connected):
    """Quem chama é a instância Chatwoot, não um usuário logado."""
    anon = APIClient()
    resp = anon.post(
        "/api/chatwoot/webhook/segredo-webhook/",
        {"event": "message_created", "conversation": {"id": 7}},
        format="json",
    )
    assert resp.status_code == 200, resp.content
    assert resp.json()["ignored"] is False


def test_webhook_com_segredo_errado_e_recusado(connected):
    anon = APIClient()
    resp = anon.post(
        "/api/chatwoot/webhook/segredo-invalido/",
        {"event": "message_created"},
        format="json",
    )
    assert resp.status_code == 403


def test_eventos_ficam_disponiveis_no_polling(connected):
    anon = APIClient()
    anon.post(
        "/api/chatwoot/webhook/segredo-webhook/",
        {"event": "message_created", "conversation": {"id": 7}},
        format="json",
    )
    resp = connected["client"].get("/api/chatwoot/events/", {"workspace_id": connected["ws_id"]})
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["events"]) == 1
    assert body["events"][0]["conversation_id"] == 7
    assert body["cursor"]


def test_polling_com_cursor_nao_repete_evento_ja_visto(connected):
    anon = APIClient()
    anon.post(
        "/api/chatwoot/webhook/segredo-webhook/",
        {"event": "message_created", "conversation": {"id": 7}},
        format="json",
    )
    first = connected["client"].get(
        "/api/chatwoot/events/", {"workspace_id": connected["ws_id"]}
    ).json()

    second = connected["client"].get(
        "/api/chatwoot/events/",
        {"workspace_id": connected["ws_id"], "after": first["cursor"]},
    ).json()
    assert second["events"] == []


# ── Catálogo ─────────────────────────────────────────────────────────────────
def test_catalogo_agrega_caixas_agentes_times_labels_e_respostas(connected):
    respostas = {
        "/inboxes": {"payload": [{"id": 1, "name": "Site", "channel_type": "Channel::WebWidget"}]},
        "/agents": [{"id": 9, "name": "Ana", "email": "ana@x.com"}],
        "/teams": [{"id": 3, "name": "Suporte"}],
        "/labels": {"payload": [{"id": 4, "title": "vip", "color": "#1F93FF"}]},
        "/canned_responses": [{"id": 5, "short_code": "ola", "content": "Olá!"}],
    }

    def fake_request(method, url, **kwargs):
        for suffix, payload in respostas.items():
            if url.endswith(suffix):
                return FakeResponse(payload)
        return FakeResponse({})

    with patch("httpx.request", side_effect=fake_request):
        resp = connected["client"].get(
            "/api/chatwoot/catalog/", {"workspace_id": connected["ws_id"]}
        )

    assert resp.status_code == 200, resp.content
    body = resp.json()
    assert body["inboxes"][0]["channel_label"] == "Chat do site"
    assert body["agents"][0]["name"] == "Ana"
    assert body["teams"][0]["name"] == "Suporte"
    assert body["labels"][0]["title"] == "vip"
    assert body["canned_responses"][0]["short_code"] == "ola"
