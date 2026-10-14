"""Tokens de agente: só o hash é guardado, importação vem do arquivo do Leonardo."""
import hashlib

import pytest

from contexts.agent_api.application.tokens import hash_token, import_agents, resolve_agent
from contexts.agent_api.infrastructure.models import AgentTokenModel
from contexts.identity.infrastructure.django.models import UserModel, WorkspaceModel


@pytest.fixture
def ws(db):
    owner = UserModel.objects.create_user(
        email="o@t4e.com", password="x", full_name="O", is_active=True
    )
    return WorkspaceModel.objects.create(name="T4E", slug="t4e", owner=owner)


def _agent(id_, token, escopos=("office:ler",), ativo=True):
    return {
        "id": id_,
        "token_hash": hashlib.sha256(token.encode()).hexdigest(),
        "ativo": ativo,
        "escopos": list(escopos),
    }


def test_importa_e_resolve_pelo_hash(ws):
    criados, atualizados = import_agents({"agents": [_agent("saude", "segredo")]}, ws)
    assert (criados, atualizados) == (1, 0)
    agent = resolve_agent("segredo")
    assert agent.id == "saude"
    assert list(agent.workspaces.all()) == [ws]
    assert hash_token("segredo") == hashlib.sha256(b"segredo").hexdigest()
    assert resolve_agent("errado") is None


def test_agente_fora_do_arquivo_e_desativado(ws):
    import_agents({"agents": [_agent("saude", "a"), _agent("velho", "b")]}, ws)
    _, atualizados = import_agents({"agents": [_agent("saude", "a")]}, ws)
    assert atualizados == 1
    assert AgentTokenModel.objects.get(id="velho").ativo is False
    assert resolve_agent("b") is None


def test_agente_marcado_inativo_nao_resolve(ws):
    import_agents({"agents": [_agent("saude", "a", ativo=False)]}, ws)
    assert resolve_agent("a") is None
