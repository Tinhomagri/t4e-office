"""Chaves de API geradas pela tela do Office (só admin): a chave aparece uma
única vez na criação, depois só o hash fica guardado."""
import pytest
from rest_framework.test import APIClient

from contexts.agent_api.application.tokens import hash_token
from contexts.agent_api.infrastructure.models import AgentTokenModel
from contexts.identity.infrastructure.django.models import (
    MembershipModel,
    UserModel,
    WorkspaceModel,
)


@pytest.fixture
def admin_client(ws):
    client = APIClient()
    client.force_authenticate(user=ws.owner)
    return client


@pytest.fixture
def membro(ws):
    user = UserModel.objects.create_user(
        email="dev@t4e.com", password="x", full_name="Dev", is_active=True
    )
    MembershipModel.objects.create(workspace=ws, user=user, role="member")
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def _url(ws, suffix=""):
    return f"/api/workspaces/{ws.id}/agent-keys/{suffix}"


def test_criar_mostra_a_chave_uma_vez_e_guarda_so_o_hash(admin_client, ws):
    resp = admin_client.post(_url(ws), {"nome": "Leonardo – saúde das squads"}, format="json")
    assert resp.status_code == 201
    body = resp.json()
    chave = body["chave"]
    assert chave.startswith("t4e_agt_") and len(chave) > 40
    agent = AgentTokenModel.objects.get(id=body["id"])
    assert agent.token_hash == hash_token(chave)
    assert agent.nome == "Leonardo – saúde das squads"
    assert agent.escopos == ["office:ler"]
    assert list(agent.workspaces.all()) == [ws]
    assert agent.criado_por_id == ws.owner.id
    # Nenhum campo do banco guarda a chave em texto.
    assert chave not in str(AgentTokenModel.objects.filter(pk=agent.pk).values().first())


def test_listagem_nunca_devolve_a_chave(admin_client, ws):
    chave = admin_client.post(_url(ws), {"nome": "A"}, format="json").json()["chave"]
    resp = admin_client.get(_url(ws))
    assert resp.status_code == 200
    (row,) = resp.json()
    assert set(row) == {"id", "nome", "ativo", "criado_em", "ultimo_uso", "criado_por"}
    assert chave not in resp.content.decode()
    assert row["criado_por"] == "Owner"


def test_chave_criada_funciona_na_api_e_marca_ultimo_uso(admin_client, ws):
    body = admin_client.post(_url(ws), {"nome": "A"}, format="json").json()
    agente = APIClient()
    agente.credentials(HTTP_AUTHORIZATION=f"Bearer {body['chave']}")
    assert agente.get("/api/agentes/v1/projetos/").status_code == 200
    assert AgentTokenModel.objects.get(id=body["id"]).ultimo_uso is not None


def test_revogar_desativa_e_a_chave_para_de_funcionar(admin_client, ws):
    body = admin_client.post(_url(ws), {"nome": "A"}, format="json").json()
    assert admin_client.delete(_url(ws, f"{body['id']}/")).status_code == 204
    agente = APIClient()
    agente.credentials(HTTP_AUTHORIZATION=f"Bearer {body['chave']}")
    assert agente.get("/api/agentes/v1/projetos/").status_code == 401
    # Continua listada (auditoria aponta pra ela), como revogada.
    assert admin_client.get(_url(ws)).json()[0]["ativo"] is False


def test_nome_obrigatorio(admin_client, ws):
    assert admin_client.post(_url(ws), {"nome": "  "}, format="json").status_code == 400


def test_membro_comum_nao_ve_nem_cria(membro, ws):
    assert membro.get(_url(ws)).status_code == 403
    assert membro.post(_url(ws), {"nome": "X"}, format="json").status_code == 403


def test_admin_de_outro_workspace_nao_mexe(admin_client, ws):
    outro = WorkspaceModel.objects.create(name="X", slug="x", owner=ws.owner)
    estranho = UserModel.objects.create_user(
        email="z@x.com", password="x", full_name="Z", is_active=True
    )
    MembershipModel.objects.create(workspace=outro, user=estranho, role="owner")
    body = admin_client.post(_url(ws), {"nome": "A"}, format="json").json()
    client = APIClient()
    client.force_authenticate(user=estranho)
    assert client.get(_url(ws)).status_code == 403
    assert client.delete(f"/api/workspaces/{outro.id}/agent-keys/{body['id']}/").status_code == 404
    assert AgentTokenModel.objects.get(id=body["id"]).ativo is True


def test_importar_arquivo_nao_revoga_chave_criada_pela_tela(admin_client, ws):
    import hashlib

    from contexts.agent_api.application.tokens import import_agents

    body = admin_client.post(_url(ws), {"nome": "Pela tela"}, format="json").json()
    import_agents(
        {"agents": [{"id": "do-arquivo", "token_hash": hashlib.sha256(b"x").hexdigest(),
                     "escopos": ["office:ler"]}]},
        ws,
    )
    assert AgentTokenModel.objects.get(id=body["id"]).ativo is True
