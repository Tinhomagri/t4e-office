"""Ferramentas de Drive do agente: sem Google conectado, devolvem
`connected: false` em vez de estourar — a IA explica em vez de travar o chat.
"""
import pytest

from contexts.copilot.infrastructure.agent.registry import AgentTools
from contexts.identity.infrastructure.django.models import (
    MembershipModel,
    UserModel,
    WorkspaceModel,
)


@pytest.fixture
def scenario(db):
    owner = UserModel.objects.create_user(
        email="drive@t4e.com", password="x", full_name="Dono", is_active=True
    )
    ws = WorkspaceModel.objects.create(name="WS", slug="ws-drive", owner=owner)
    MembershipModel.objects.create(workspace=ws, user=owner, role="owner")
    return {"owner": owner, "ws": ws}


@pytest.mark.django_db
def test_busca_sem_google_conectado_nao_estoura(scenario):
    tools = AgentTools(
        workspace_id=str(scenario["ws"].id), actor_id=str(scenario["owner"].id)
    )

    result = tools.execute_read("drive_search_files", {"query": "transcrição"})

    assert result["connected"] is False


@pytest.mark.django_db
def test_busca_sem_termo_devolve_erro_como_contexto_nao_excecao(scenario):
    """`execute_read` do registry captura tudo — nunca deixa a IA travar por
    um argumento faltando."""
    tools = AgentTools(
        workspace_id=str(scenario["ws"].id), actor_id=str(scenario["owner"].id)
    )

    result = tools.execute_read("drive_search_files", {})

    assert "error" in result or result.get("connected") is False
