"""Implementação do AiAnalyzer usando o Gemini.

Reaproveita TODA a lógica do OpenAiAnalyzer (chat, chat_agent, analyze,
tool-calling) em vez de escrever um cliente do zero: a própria Google expõe
uma camada compatível com a API da OpenAI para o Gemini
(https://ai.google.dev/gemini-api/docs/openai), então só trocar o endpoint
já basta — sem puxar mais um SDK novo pro projeto.
"""
from contexts.copilot.infrastructure.openai_analyzer import OpenAiAnalyzer

GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"
DEFAULT_MODEL = "gemini-2.5-pro"


class GeminiAnalyzer(OpenAiAnalyzer):
    """Mesmo comportamento do OpenAiAnalyzer — só o endpoint muda."""

    provider_label = "Google (Gemini)"

    def __init__(self, *, api_key: str = "", model: str = ""):
        self.api_key = api_key
        self.model = model or DEFAULT_MODEL

    def _client(self):
        from openai import OpenAI

        return OpenAI(api_key=self.api_key, base_url=GEMINI_BASE_URL)
