"""Implementação do AiAnalyzer usando a API da Anthropic (Claude)."""
import json

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
                "Copiloto IA não configurado: informe a chave da Anthropic (Claude) "
                "nas configurações de IA do workspace."
            )
        import anthropic

        system = system or _prompt.CHAT_AGENT_SYSTEM
        client = anthropic.Anthropic(api_key=self.api_key)
        # A spec neutra de ferramentas já casa com o formato da Anthropic.
        convo = [{"role": m["role"], "content": m["content"]} for m in messages]
        pending_actions: list[dict] = []
        # Ferramentas efetivamente consultadas — vira contexto na resposta de
        # teto, para o usuário saber o que já foi olhado antes de desistir.
        used_tools: list[str] = []

        for _ in range(_prompt.MAX_AGENT_STEPS):
            resp = client.messages.create(
                model=self.model,
                max_tokens=_prompt.MAX_CHAT_TOKENS,
                system=system,
                tools=tools,
                messages=convo,
            )
            text = "".join(b.text for b in resp.content if b.type == "text").strip()
            tool_uses = [b for b in resp.content if b.type == "tool_use"]

            if resp.stop_reason != "tool_use" or not tool_uses:
                return {"reply": text, "pending_actions": pending_actions}

            convo.append({"role": "assistant", "content": resp.content})
            results = []
            stop_after = False
            for tu in tool_uses:
                if tu.name == "propose_actions":
                    pending_actions.extend((tu.input or {}).get("actions", []))
                    results.append(
                        {
                            "type": "tool_result",
                            "tool_use_id": tu.id,
                            "content": "Ações registradas como proposta pendente de "
                            "confirmação do usuário. Resuma-as e peça confirmação.",
                        }
                    )
                    stop_after = True
                else:
                    used_tools.append(tu.name)
                    out = read_executor(tu.name, tu.input or {})
                    results.append(
                        {
                            "type": "tool_result",
                            "tool_use_id": tu.id,
                            "content": json.dumps(out, ensure_ascii=False),
                        }
                    )
            convo.append({"role": "user", "content": results})

            if stop_after:
                # Uma última passagem para a IA resumir a proposta em texto.
                final = client.messages.create(
                    model=self.model,
                    max_tokens=_prompt.MAX_CHAT_TOKENS,
                    system=_prompt.CHAT_AGENT_SYSTEM,
                    tools=tools,
                    messages=convo,
                )
                reply = "".join(
                    b.text for b in final.content if b.type == "text"
                ).strip()
                return {"reply": reply, "pending_actions": pending_actions}

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
