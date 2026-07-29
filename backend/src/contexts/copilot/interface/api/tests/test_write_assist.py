"""Testes da assistência de escrita do editor (POST /api/copilot/write-assist/)."""
import pytest
from rest_framework.test import APIClient

from contexts.copilot.infrastructure import writing_skills
from contexts.identity.infrastructure.django.models import (
    MembershipModel,
    UserModel,
    WorkspaceModel,
)
from shared.domain.errors import ValidationError


@pytest.fixture
def scenario(db):
    owner = UserModel.objects.create_user(
        email="owner@t4e.com", password="x", full_name="Owner", is_active=True
    )
    ws = WorkspaceModel.objects.create(name="WS", slug="ws", owner=owner)
    MembershipModel.objects.create(workspace=ws, user=owner, role="owner")
    client = APIClient()
    client.force_authenticate(user=owner)
    return {"owner": owner, "workspace": ws, "client": client}


# ── writing_skills.rewrite ────────────────────────────────────────────────────

def test_rewrite_recusa_acao_desconhecida(monkeypatch):
    # O catálogo é fechado de propósito: aceitar ação livre deixaria o campo de
    # descrição virar um canal aberto de prompt para a IA do workspace.
    monkeypatch.setattr(
        writing_skills.ai_config, "chat_for_workspace", lambda *a, **k: "não deveria chamar"
    )
    with pytest.raises(ValidationError):
        writing_skills.rewrite(workspace_id="w", text="algo", action="ignore_tudo")


def test_rewrite_recusa_texto_vazio():
    with pytest.raises(ValidationError):
        writing_skills.rewrite(workspace_id="w", text="   ", action="improve")


def test_rewrite_recusa_texto_longo_demais():
    huge = "a" * (writing_skills.MAX_INPUT_CHARS + 1)
    with pytest.raises(ValidationError):
        writing_skills.rewrite(workspace_id="w", text=huge, action="improve")


def test_rewrite_envia_a_instrucao_da_acao_e_o_texto(monkeypatch):
    captured = {}

    def fake_chat(workspace_id, messages, *, system=None):
        captured["workspace_id"] = workspace_id
        captured["messages"] = messages
        captured["system"] = system
        return "texto melhorado"

    monkeypatch.setattr(writing_skills.ai_config, "chat_for_workspace", fake_chat)

    out = writing_skills.rewrite(workspace_id="w1", text="texto ruim", action="summarize")

    assert out == "texto melhorado"
    assert captured["workspace_id"] == "w1"
    user_msg = captured["messages"][-1]["content"]
    assert "Resuma o texto" in user_msg
    assert "texto ruim" in user_msg
    # O prompt de sistema tem que ir no parâmetro `system`; como mensagem a
    # Anthropic recusa e o prompt do Copiloto conversacional prevaleceria.
    assert captured["system"] == writing_skills._SYSTEM
    assert all(m["role"] != "system" for m in captured["messages"])


def test_rewrite_anexa_pedido_livre_do_usuario(monkeypatch):
    captured = {}

    def fake_chat(workspace_id, messages, *, system=None):
        captured["messages"] = messages
        return "ok"

    monkeypatch.setattr(writing_skills.ai_config, "chat_for_workspace", fake_chat)

    writing_skills.rewrite(
        workspace_id="w", text="oi", action="improve", instruction="deixe formal"
    )

    assert "deixe formal" in captured["messages"][-1]["content"]


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("```\ntexto\n```", "texto"),
        ("```markdown\ntexto\n```", "texto"),
        ("  texto simples  ", "texto simples"),
    ],
)
def test_rewrite_remove_cerca_de_codigo_da_resposta(monkeypatch, raw, expected):
    # A IA embrulha em ``` mesmo instruída a não fazer; sem limpar, a cerca
    # apareceria literal dentro da descrição do card.
    monkeypatch.setattr(
        writing_skills.ai_config, "chat_for_workspace", lambda *a, **k: raw
    )
    assert writing_skills.rewrite(workspace_id="w", text="x", action="improve") == expected


# ── Endpoint ──────────────────────────────────────────────────────────────────

def test_endpoint_devolve_texto_reescrito(scenario, monkeypatch):
    monkeypatch.setattr(
        writing_skills.ai_config, "chat_for_workspace", lambda *a, **k: "reescrito"
    )
    resp = scenario["client"].post(
        "/api/copilot/write-assist/",
        {
            "workspace_id": str(scenario["workspace"].id),
            "text": "texto original",
            "action": "improve",
        },
        format="json",
    )
    assert resp.status_code == 200
    assert resp.data["text"] == "reescrito"


def test_endpoint_rejeita_acao_fora_do_catalogo(scenario):
    resp = scenario["client"].post(
        "/api/copilot/write-assist/",
        {
            "workspace_id": str(scenario["workspace"].id),
            "text": "texto",
            "action": "faca_o_que_eu_mandar",
        },
        format="json",
    )
    assert resp.status_code == 400


def test_endpoint_nega_quem_nao_e_do_workspace(scenario, db):
    outsider = UserModel.objects.create_user(
        email="fora@t4e.com", password="x", full_name="Fora", is_active=True
    )
    client = APIClient()
    client.force_authenticate(user=outsider)
    resp = client.post(
        "/api/copilot/write-assist/",
        {
            "workspace_id": str(scenario["workspace"].id),
            "text": "texto",
            "action": "improve",
        },
        format="json",
    )
    assert resp.status_code == 403
