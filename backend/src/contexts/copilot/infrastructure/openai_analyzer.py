"""Implementação do AiAnalyzer usando a API da OpenAI."""
import json

from django.conf import settings

from contexts.copilot.domain.entities.analysis import AnalysisResult
from contexts.copilot.domain.ports.ai_analyzer import AiAnalyzer
from contexts.copilot.infrastructure import ai_prompt as _prompt
from shared.domain.errors import ValidationError


class OpenAiAnalyzer(AiAnalyzer):
    """Analisa texto com um modelo da OpenAI e retorna a síntese estruturada."""

    # Nome usado na mensagem de erro de chave ausente — o `GeminiAnalyzer`
    # herda todo o resto desta classe e só troca isto e o endpoint.
    provider_label = "OpenAI"

    def __init__(self, *, api_key: str = "", model: str = ""):
        self.api_key = api_key
        self.model = model or settings.OPENAI_MODEL

    def _client(self):
        """Import tardio: a dependência só é necessária quando a IA é de fato
        usada. Método próprio (em vez de instanciar direto em cada chamada)
        porque o `GeminiAnalyzer` reaproveita TODA esta classe só trocando o
        endpoint — o Gemini fala o mesmo formato via camada de compatibilidade
        da própria Google."""
        from openai import OpenAI

        return OpenAI(api_key=self.api_key)

    def analyze(self, *, text: str) -> AnalysisResult:
        if not self.api_key:
            raise ValidationError(
                "Copiloto IA não configurado: informe a chave da "
                f"{self.provider_label} nas configurações de IA do workspace."
            )

        client = self._client()
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

    def chat(self, *, messages: list[dict], system: str | None = None) -> str:
        if not self.api_key:
            raise ValidationError(
                "Copiloto IA não configurado: informe a chave da "
                f"{self.provider_label} nas configurações de IA do workspace."
            )
        client = self._client()
        response = client.chat.completions.create(
            model=self.model,
            max_tokens=_prompt.MAX_CHAT_TOKENS,
            messages=[
                {"role": "system", "content": system or _prompt.CHAT_SYSTEM},
                *[{"role": m["role"], "content": m["content"]} for m in messages],
            ],
        )
        return (response.choices[0].message.content or "").strip()

    def chat_agent(
        self,
        *,
        messages: list[dict],
        tools: list[dict],
        read_executor,
        system: str | None = None,
    ) -> dict:
        if not self.api_key:
            raise ValidationError(
                "Copiloto IA não configurado: informe a chave da "
                f"{self.provider_label} nas configurações de IA do workspace."
            )
        client = self._client()
        oa_tools = _prompt.to_openai_tools(tools)
        convo = [
            {"role": "system", "content": system or _prompt.CHAT_AGENT_SYSTEM},
            *[{"role": m["role"], "content": m["content"]} for m in messages],
        ]
        pending_actions: list[dict] = []
        # Ferramentas efetivamente consultadas — vira contexto na resposta de
        # teto, para o usuário saber o que já foi olhado antes de desistir.
        used_tools: list[str] = []

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
                    # `model_dump()`, não um dict reconstruído campo a campo:
                    # o Gemini (via camada de compatibilidade OpenAI) manda um
                    # `thought_signature` extra em cada tool call que precisa
                    # voltar exatamente igual na próxima chamada — a OpenAI de
                    # verdade não tem esse campo e não se importa em receber o
                    # dump inteiro de volta.
                    "tool_calls": [c.model_dump() for c in calls],
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
                    used_tools.append(c.function.name)
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

        consulted = ", ".join(dict.fromkeys(used_tools)) or "nenhuma"
        return {
            "reply": (
                "Não consegui concluir dentro do limite de "
                f"{_prompt.MAX_AGENT_STEPS} consultas. Já olhei: {consulted}. "
                "Refaça a pergunta mais específica (ex.: cite o projeto ou o "
                "negócio) para eu chegar à resposta."
            ),
            "pending_actions": pending_actions,
        }
