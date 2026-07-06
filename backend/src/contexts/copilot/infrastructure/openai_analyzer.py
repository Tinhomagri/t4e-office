"""Implementação do AiAnalyzer usando a API da OpenAI."""
import json

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

    def chat_agent(self, *, messages: list[dict], tools: list[dict], read_executor) -> dict:
        if not self.api_key:
            raise ValidationError(
                "Copiloto IA não configurado: informe a chave da OpenAI "
                "nas configurações de IA do workspace."
            )
        from openai import OpenAI

        client = OpenAI(api_key=self.api_key)
        oa_tools = _prompt.to_openai_tools(tools)
        convo = [
            {"role": "system", "content": _prompt.CHAT_AGENT_SYSTEM},
            *[{"role": m["role"], "content": m["content"]} for m in messages],
        ]
        pending_actions: list[dict] = []

        for _ in range(_prompt.MAX_AGENT_STEPS):
            resp = client.chat.completions.create(
                model=self.model,
                max_tokens=_prompt.MAX_CHAT_TOKENS,
                messages=convo,
                tools=oa_tools,
            )
            msg = resp.choices[0].message
            calls = msg.tool_calls or []
            if not calls:
                return {
                    "reply": (msg.content or "").strip(),
                    "pending_actions": pending_actions,
                }

            convo.append(
                {
                    "role": "assistant",
                    "content": msg.content or "",
                    "tool_calls": [
                        {
                            "id": c.id,
                            "type": "function",
                            "function": {
                                "name": c.function.name,
                                "arguments": c.function.arguments,
                            },
                        }
                        for c in calls
                    ],
                }
            )
            stop_after = False
            for c in calls:
                args = json.loads(c.function.arguments or "{}")
                if c.function.name == "propose_actions":
                    pending_actions.extend(args.get("actions", []))
                    out = "Ações registradas como proposta pendente de confirmação."
                    stop_after = True
                else:
                    out = json.dumps(
                        read_executor(c.function.name, args), ensure_ascii=False
                    )
                convo.append(
                    {"role": "tool", "tool_call_id": c.id, "content": out}
                )

            if stop_after:
                final = client.chat.completions.create(
                    model=self.model,
                    max_tokens=_prompt.MAX_CHAT_TOKENS,
                    messages=convo,
                    tools=oa_tools,
                )
                return {
                    "reply": (final.choices[0].message.content or "").strip(),
                    "pending_actions": pending_actions,
                }

        return {
            "reply": "Não consegui concluir o raciocínio dentro do limite de passos.",
            "pending_actions": pending_actions,
        }
