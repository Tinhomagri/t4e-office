"""GeminiAnalyzer reaproveita toda a lógica do OpenAiAnalyzer — só o endpoint
e o rótulo do erro de chave ausente mudam (a Google expõe uma camada
compatível com a API da OpenAI para o Gemini)."""
from unittest.mock import MagicMock

import pytest
from openai.types.chat.chat_completion_message import ChatCompletionMessage
from openai.types.chat.chat_completion_message_tool_call import (
    ChatCompletionMessageToolCall,
    Function,
)

from contexts.copilot.infrastructure.ai_config import PROVIDERS, build_analyzer
from contexts.copilot.infrastructure.django import crypto
from contexts.copilot.infrastructure.django.models import WorkspaceAiConfigModel
from contexts.copilot.infrastructure.gemini_analyzer import GEMINI_BASE_URL, GeminiAnalyzer
from contexts.identity.infrastructure.django.models import UserModel, WorkspaceModel
from shared.domain.errors import ValidationError


def _resp(message):
    resp = MagicMock()
    resp.choices = [MagicMock(message=message)]
    return resp


def test_google_esta_no_catalogo_de_provedores():
    assert PROVIDERS["google"]["default_model"] == "gemini-2.5-pro"


def test_client_aponta_pro_endpoint_compativel_do_gemini():
    analyzer = GeminiAnalyzer(api_key="chave-fake")
    client = analyzer._client()
    assert str(client.base_url) == GEMINI_BASE_URL


def test_sem_chave_a_mensagem_cita_o_provedor_certo():
    analyzer = GeminiAnalyzer(api_key="")
    with pytest.raises(ValidationError, match="Google \\(Gemini\\)"):
        analyzer.chat(messages=[{"role": "user", "content": "oi"}])


@pytest.mark.django_db
def test_build_analyzer_escolhe_gemini_pro_provider_google():
    dono = UserModel.objects.create_user(
        email="dono@t4e.com", password="x", full_name="Dono", is_active=True
    )
    ws = WorkspaceModel.objects.create(name="T4E", slug="t4e", owner=dono)
    cfg = WorkspaceAiConfigModel.objects.create(
        workspace=ws,
        provider="google",
        model="gemini-2.5-pro",
        api_key_encrypted=crypto.encrypt("chave-fake"),
    )

    analyzer = build_analyzer(cfg)

    assert isinstance(analyzer, GeminiAnalyzer)
    assert analyzer.model == "gemini-2.5-pro"


def test_thought_signature_do_gemini_volta_intacto_na_proxima_chamada():
    """Regressão: o Gemini (via camada de compatibilidade OpenAI) recusa a
    conversa com 400 se o `thought_signature` de uma tool call não voltar
    EXATO na chamada seguinte — reconstruir o dict campo a campo (id/type/
    function) descartava esse campo extra por não saber que ele existia."""
    tool_call = ChatCompletionMessageToolCall(
        id="call_1",
        type="function",
        function=Function(name="board_summary", arguments="{}"),
        thought_signature="sig-abc",
    )
    first = ChatCompletionMessage(role="assistant", content=None, tool_calls=[tool_call])
    second = ChatCompletionMessage(role="assistant", content="pronto")

    fake_client = MagicMock()
    fake_client.chat.completions.create.side_effect = [_resp(first), _resp(second)]

    analyzer = GeminiAnalyzer(api_key="chave-fake")
    analyzer._client = lambda: fake_client

    analyzer.chat_agent(
        messages=[{"role": "user", "content": "resuma o board"}],
        tools=[],
        read_executor=lambda name, args: {"ok": True},
    )

    segunda_chamada = fake_client.chat.completions.create.call_args_list[1]
    mensagens_enviadas = segunda_chamada.kwargs["messages"]
    assistant_msg = next(m for m in mensagens_enviadas if m["role"] == "assistant")
    assert assistant_msg["tool_calls"][0]["thought_signature"] == "sig-abc"
