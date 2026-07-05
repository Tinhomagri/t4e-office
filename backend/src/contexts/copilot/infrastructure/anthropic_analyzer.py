"""Implementação do AiAnalyzer usando a API da Anthropic (Claude)."""
from django.conf import settings

from contexts.copilot.domain.entities.analysis import AnalysisResult
from contexts.copilot.domain.ports.ai_analyzer import AiAnalyzer
from contexts.copilot.infrastructure import ai_prompt as _prompt
from shared.domain.errors import ValidationError

class AnthropicAnalyzer(AiAnalyzer):
    """Analisa texto com Claude e retorna a síntese estruturada."""

    def __init__(self, *, api_key: str = "", model: str = ""):
        # Fallback para as settings globais mantém compatibilidade com o modo antigo.
        self.api_key = api_key or settings.ANTHROPIC_API_KEY
        self.model = model or settings.ANTHROPIC_MODEL

    def analyze(self, *, text: str) -> AnalysisResult:
        if not self.api_key:
            raise ValidationError(
                "Copiloto IA não configurado: informe a chave da Anthropic (Claude) "
                "nas configurações de IA do workspace."
            )

        # Import tardio: a dependência só é necessária quando a IA é de fato usada.
        import anthropic

        client = anthropic.Anthropic(api_key=self.api_key)
        clipped = text[: _prompt.MAX_CHARS]

        response = client.messages.create(
            model=self.model,
            max_tokens=8000,
            system=_prompt.SYSTEM,
            output_config={"format": {"type": "json_schema", "schema": _prompt.SCHEMA}},
            messages=[{"role": "user", "content": _prompt.USER_PROMPT + clipped}],
        )

        raw = next((b.text for b in response.content if b.type == "text"), "{}")
        return _prompt.parse_analysis(raw)

    def chat(self, *, messages: list[dict]) -> str:
        if not self.api_key:
            raise ValidationError(
                "Copiloto IA não configurado: informe a chave da Anthropic (Claude) "
                "nas configurações de IA do workspace."
            )
        import anthropic

        client = anthropic.Anthropic(api_key=self.api_key)
        response = client.messages.create(
            model=self.model,
            max_tokens=_prompt.MAX_CHAT_TOKENS,
            system=_prompt.CHAT_SYSTEM,
            messages=[{"role": m["role"], "content": m["content"]} for m in messages],
        )
        return "".join(b.text for b in response.content if b.type == "text").strip()
