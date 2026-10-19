"""Regras de acesso da API de agentes (seção 3 do documento do Leonardo)."""
import hashlib
import uuid

import pytest
from rest_framework.test import APIClient

from contexts.agent_api.application.tokens import import_agents
from contexts.agent_api.infrastructure.models import AgentAuditLogModel

from .conftest import TOKEN

BASE = "/api/agentes/v1"


def test_health_sem_token(db):
    resp = APIClient().get(f"{BASE}/health/")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_openapi_sem_token(db):
    resp = APIClient().get(f"{BASE}/openapi.json")
    assert resp.status_code == 200
    assert "/api/agentes/v1/auditoria/" in resp.json()["paths"]


def test_sem_token_401(agente):
    resp = APIClient().get(f"{BASE}/auditoria/")
    assert resp.status_code == 401
    assert resp.json()["erro"] == "nao_autenticado"


def test_token_invalido_401_e_auditado(agente):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION="Bearer errado")
    resp = client.get(f"{BASE}/auditoria/")
    assert resp.status_code == 401
    row = AgentAuditLogModel.objects.get()
    assert row.agente is None and row.status == 401


def test_token_sem_escopo_403(ws):
    import_agents(
        {"agents": [{"id": "x", "token_hash": hashlib.sha256(b"t2").hexdigest(), "escopos": []}]},
        ws,
    )
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION="Bearer t2")
    resp = client.get(f"{BASE}/auditoria/")
    assert resp.status_code == 403
    assert resp.json()["erro"] == "escopo_insuficiente"


@pytest.mark.parametrize("method", ["post", "put", "patch", "delete"])
def test_escrita_403_somente_leitura_e_auditada(api, method):
    resp = getattr(api, method)(
        f"{BASE}/projetos/", {}, format="json", HTTP_X_CORRELATION_ID="corr-1"
    )
    assert resp.status_code == 403
    assert resp.json()["erro"] == "somente_leitura"
    row = AgentAuditLogModel.objects.get()
    assert (row.agente_id, row.metodo, row.status, row.correlation_id) == (
        "saude-squads", method.upper(), 403, "corr-1",
    )


def test_escrita_em_rota_normal_do_office_tambem_403(api):
    resp = api.post(f"/api/cards/{uuid.uuid4()}/pause/")
    assert resp.status_code == 403
    assert resp.json()["erro"] == "somente_leitura"


def test_token_de_agente_nao_vale_em_rota_normal(api):
    resp = api.get("/api/projects/")
    assert resp.status_code == 401


def test_limite_de_taxa_429(api):
    for _ in range(60):
        assert api.get(f"{BASE}/auditoria/").status_code == 200
    resp = api.get(f"{BASE}/auditoria/")
    assert resp.status_code == 429
    assert int(resp["Retry-After"]) >= 1
    assert resp.json()["erro"] == "limite_excedido"


@pytest.mark.parametrize("path", ["/nada/", "/../.env", "/%2e%2e/.env"])
def test_rota_inexistente_404_json(api, path):
    resp = api.get(f"{BASE}{path}")
    assert resp.status_code == 404
    assert "DATABASE" not in resp.content.decode()


def test_rota_inexistente_dentro_do_prefixo_json(api):
    resp = api.get(f"{BASE}/nada/")
    assert resp.json()["erro"] == "nao_encontrado"


def test_auditoria_lista_no_envelope_com_filtros(api):
    api.post(f"{BASE}/projetos/", HTTP_X_CORRELATION_ID="c-9")
    resp = api.get(f"{BASE}/auditoria/?agente=saude-squads")
    body = resp.json()
    assert resp.status_code == 200
    assert body["meta"]["total"] >= 1
    linha = next(r for r in body["dados"] if r["status"] == 403)
    assert set(linha) == {"id", "agente", "metodo", "rota", "status", "correlation_id", "quando"}
    assert linha["correlation_id"] == "c-9"
    vazio = api.get(f"{BASE}/auditoria/?agente=outro").json()
    assert vazio["dados"] == [] and vazio["meta"]["total"] == 0


def test_updated_since_invalido_400(api):
    resp = api.get(f"{BASE}/auditoria/?desde=ontem")
    assert resp.status_code == 400
    assert resp.json()["erro"] == "parametro_invalido"


def test_token_usado_de_outro_jeito_nao_vaza(agente):
    # Token correto mas em header errado → como se não houvesse token.
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Token {TOKEN}")
    assert client.get(f"{BASE}/auditoria/").status_code == 401


def test_auditoria_mostra_tentativa_com_token_invalido(api):
    bad = APIClient()
    bad.credentials(HTTP_AUTHORIZATION="Bearer errado")
    bad.get(f"{BASE}/projetos/", HTTP_X_CORRELATION_ID="invasor")
    linhas = api.get(f"{BASE}/auditoria/").json()["dados"]
    linha = next(r for r in linhas if r["correlation_id"] == "invasor")
    assert (linha["agente"], linha["status"]) == (None, 401)


def test_mensagem_de_erro_sem_acento_escapado(db):
    resp = APIClient().get(f"{BASE}/projetos/")
    assert "inválido" in resp.content.decode()
