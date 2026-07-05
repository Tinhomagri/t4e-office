"""Implementação do AiAnalyzer usando a API da OpenAI."""
from django.conf import settings

from contexts.copilot.domain.entities.analysis import AnalysisResult
from contexts.copilot.domain.ports.ai_analyzer import AiAnalyzer
from contexts.copilot.infrastructure import ai_prompt as _prompt
from shared.domain.errors import ValidationError


class OpenAiAnalyzer(AiAnalyzer):
    """Analisa texto com um modelo da OpenAI e retorna a síntese estruturada."""

    def __init__(self, *, api_key: str = "", model: str = ""):
        self.api_key = api_key
        self.model = model or settings.OPENAI_MODEL

    def analyze(self, *, text: str) -> AnalysisResult:
        if not self.api_key:
            raise ValidationError(
                "Copiloto IA não configurado: informe a chave da OpenAI "
                "nas configurações de IA do workspace."
            )

        # Import tardio: a dependência só é necessária quando a IA é de fato usada.
        from openai import OpenAI

        client = OpenAI(api_key=self.api_key)
        clipped = text[: _prompt.MAX_CHARS]

        response = client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": _prompt.SYSTEM},
                {"role": "user", "content": _prompt.USER_PROMPT + clipped},
            ],
            response_format={
                "type": "json_schema",
                "json_schema": {
                    "name": "analysis",
                    "strict": True,
                    "schema": _prompt.SCHEMA,
                },
            },
        )
        raw = response.choices[0].message.content or "{}"
        return _prompt.parse_analysis(raw)

    def chat(self, *, messages: list[dict]) -> str:
        if not self.api_key:
            raise ValidationError(
                "Copiloto IA não configurado: informe a chave da OpenAI "
                "nas configurações de IA do workspace."
            )
        from openai import OpenAI

        client = OpenAI(api_key=self.api_key)
        response = client.chat.completions.create(
            model=self.model,
            max_tokens=_prompt.MAX_CHAT_TOKENS,
            messages=[
                {"role": "system", "content": _prompt.CHAT_SYSTEM},
                *[{"role": m["role"], "content": m["content"]} for m in messages],
            ],
        )
        return (response.choices[0].message.content or "").strip()
