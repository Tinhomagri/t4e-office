"""Critério de aceite do Leonardo (§7), ponta a ponta — rotas da etapa 1.
`/sprints` e `/pessoas` entram na etapa 2."""
import json

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from contexts.agent_api.infrastructure.models import AgentAuditLogModel
from contexts.projects.infrastructure.django.models import CardModel, ProjectModel, WorklogModel

BASE = "/api/agentes/v1"
LISTAS = ["projetos", "cards", "horas"]
PROIBIDOS = ("email", "phone", "telefone", "salario", "salary", "custo", "cost", "cpf")


@pytest.fixture
def dados(ws):
    p = ProjectModel.objects.create(workspace=ws, name="P", key="P", manager_contract_id="C-1")
    c = CardModel.objects.create(project=p, number=1, title="C", assignee=ws.owner)
    WorklogModel.objects.create(card=c, author=ws.owner, time_seconds=3600, started_at=timezone.now())


def test_1_health_sem_token(db):
    assert APIClient().get(f"{BASE}/health/").status_code == 200


def test_2_sem_token_e_token_invalido_401(agente):
    for rota in LISTAS:
        assert APIClient().get(f"{BASE}/{rota}/").status_code == 401
        bad = APIClient()
        bad.credentials(HTTP_AUTHORIZATION="Bearer invalido")
        assert bad.get(f"{BASE}/{rota}/").status_code == 401


def test_3_token_valido_le_no_envelope(api, dados):
    for rota in LISTAS:
        body = api.get(f"{BASE}/{rota}/").json()
        assert set(body) == {"dados", "meta"}
        assert set(body["meta"]) == {"proximo_cursor", "total"}
        assert body["meta"]["total"] == 1, rota


@pytest.mark.parametrize("method", ["post", "put", "patch", "delete"])
@pytest.mark.parametrize("rota", LISTAS)
def test_4_escrita_403_e_auditada(api, dados, method, rota):
    resp = getattr(api, method)(f"{BASE}/{rota}/", {}, format="json")
    assert resp.status_code == 403
    assert resp.json()["erro"] == "somente_leitura"
    assert AgentAuditLogModel.objects.filter(
        metodo=method.upper(), status=403, rota__startswith=f"{BASE}/{rota}/"
    ).exists()


def test_5_paginacao_e_updated_since(api, dados, ws):
    ProjectModel.objects.create(workspace=ws, name="P2", key="P2")
    p1 = api.get(f"{BASE}/projetos/?limit=1").json()
    assert p1["meta"]["proximo_cursor"]
    p2 = api.get(f"{BASE}/projetos/?limit=1&cursor={p1['meta']['proximo_cursor']}").json()
    assert p1["dados"][0]["id"] != p2["dados"][0]["id"]
    futuro = (timezone.now() + timezone.timedelta(hours=1)).isoformat()
    for rota in LISTAS:
        assert api.get(f"{BASE}/{rota}/", {"updated_since": futuro}).json()["dados"] == [], rota


def test_6_sem_dados_pessoais(api, dados):
    for rota in LISTAS:
        texto = json.dumps(api.get(f"{BASE}/{rota}/").json()).lower()
        for chave in PROIBIDOS:
            assert f'"{chave}' not in texto, (rota, chave)
        assert "owner@t4e.com" not in texto


@pytest.mark.parametrize("path", ["/../.env", "/..%2f.env", "/.env", "/static/../../.env"])
def test_7_arquivo_do_servidor_404(api, path):
    resp = api.get(f"{BASE}{path}")
    assert resp.status_code == 404
    assert "SECRET" not in resp.content.decode()


def test_openapi_documenta_as_rotas(db):
    paths = APIClient().get(f"{BASE}/openapi.json").json()["paths"]
    for rota in ("projetos/", "cards/", "cards/{card_id}/", "horas/", "auditoria/"):
        assert f"{BASE}/{rota}" in paths
    assert not any(not p.startswith(BASE) for p in paths)
