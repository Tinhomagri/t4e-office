import hashlib

import pytest
from django.core.cache import cache
from rest_framework.test import APIClient

from contexts.agent_api.application.tokens import import_agents
from contexts.identity.infrastructure.django.models import (
    MembershipModel,
    UserModel,
    WorkspaceModel,
)

TOKEN = "token-de-teste"


@pytest.fixture(autouse=True)
def _limpa_cache():
    # Contador do limite de taxa vive no cache — não vaza entre testes.
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def ws(db):
    owner = UserModel.objects.create_user(
        email="owner@t4e.com", password="x", full_name="Owner", is_active=True
    )
    ws = WorkspaceModel.objects.create(name="T4E", slug="t4e", owner=owner)
    MembershipModel.objects.create(workspace=ws, user=owner, role="owner")
    return ws


@pytest.fixture
def agente(ws):
    import_agents(
        {
            "agents": [
                {
                    "id": "saude-squads",
                    "token_hash": hashlib.sha256(TOKEN.encode()).hexdigest(),
                    "ativo": True,
                    "escopos": ["office:ler"],
                }
            ]
        },
        ws,
    )
    from contexts.agent_api.infrastructure.models import AgentTokenModel

    return AgentTokenModel.objects.get(id="saude-squads")


@pytest.fixture
def api(agente):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {TOKEN}")
    return client
