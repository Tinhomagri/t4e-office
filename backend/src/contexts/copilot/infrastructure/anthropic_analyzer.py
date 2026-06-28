"""Implementação do AiAnalyzer usando a API da Anthropic (Claude)."""
import json

from django.conf import settings

from contexts.copilot.domain.entities.analysis import AnalysisResult, SuggestedTask
from contexts.copilot.domain.ports.ai_analyzer import AiAnalyzer
from shared.domain.errors import ValidationError

# Schema de saída estruturada — garante JSON válido no formato esperado.
_SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "tasks": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "description": {"type": "string"},
                    "priority": {
                        "type": "string",
                        "enum": ["low", "medium", "high", "urgent"],
                    },
                    "type": {
                        "type": "string",
                        "enum": ["feature", "bug", "debt", "spike", "chore"],
                    },
                },
                "required": ["title", "description", "priority", "type"],
                "additionalProperties": False,
            },
        },
        "decisions": {"type": "array", "items": {"type": "string"}},
        "risks": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["summary", "tasks", "decisions", "risks"],
    "additionalProperties": False,
}

_SYSTEM = (
    "Você é um analista de projetos. Recebe documentos e transcrições (reuniões, "
    "atas, especificações) em português e extrai: um resumo objetivo, uma lista de "
    "tarefas acionáveis, as decisões tomadas e os riscos identificados. "
    "Tarefas devem ter títulos curtos e imperativos (ex.: 'Implementar login por SSO') "
    "e descrição com o contexto necessário. Classifique prioridade e tipo de cada tarefa. "
    "Responda sempre em português."
)

# Limite defensivo de entrada (~ caracteres) para conter custo/latência no MVP síncrono.
_MAX_CHARS = 120_000


class AnthropicAnalyzer(AiAnalyzer):
    """Analisa texto com Claude e retorna a síntese estruturada."""

    def analyze(self, *, text: str) -> AnalysisResult:
        api_key = settings.ANTHROPIC_API_KEY
        if not api_key:
            raise ValidationError(
                "Copiloto IA não configurado: defina ANTHROPIC_API_KEY no servidor."
            )

        # Import tardio: a dependência só é necessária quando a IA é de fato usada.
        import anthropic

        client = anthropic.Anthropic(api_key=api_key)
        clipped = text[:_MAX_CHARS]

        response = client.messages.create(
            model=settings.ANTHROPIC_MODEL,
            max_tokens=8000,
            system=_SYSTEM,
            output_config={"format": {"type": "json_schema", "schema": _SCHEMA}},
            messages=[
                {
                    "role": "user",
                    "content": (
                        "Analise o documento abaixo e extraia resumo, tarefas, "
                        "decisões e riscos.\n\n---\n" + clipped
                    ),
                }
            ],
        )

        raw = next((b.text for b in response.content if b.type == "text"), "{}")
        data = json.loads(raw)
        return AnalysisResult(
            summary=data.get("summary", ""),
            tasks=[
                SuggestedTask(
                    title=t["title"],
                    description=t.get("description", ""),
                    priority=t.get("priority", "medium"),
                    type=t.get("type", "feature"),
                )
                for t in data.get("tasks", [])
            ],
            decisions=data.get("decisions", []),
            risks=data.get("risks", []),
        )
