"""Prompt, schema e parsing compartilhados entre os provedores de IA."""
import json

from contexts.copilot.domain.entities.analysis import AnalysisResult, SuggestedTask

# Schema de saída estruturada — garante JSON válido no formato esperado.
SCHEMA = {
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

SYSTEM = (
    "Você é um analista de projetos. Recebe documentos e transcrições (reuniões, "
    "atas, especificações) em português e extrai: um resumo objetivo, uma lista de "
    "tarefas acionáveis, as decisões tomadas e os riscos identificados. "
    "Tarefas devem ter títulos curtos e imperativos (ex.: 'Implementar login por SSO') "
    "e descrição com o contexto necessário. Classifique prioridade e tipo de cada tarefa. "
    "Responda sempre em português."
)

USER_PROMPT = (
    "Analise o documento abaixo e extraia resumo, tarefas, decisões e riscos.\n\n---\n"
)

# Limite defensivo de entrada (~ caracteres) para conter custo/latência no MVP síncrono.
MAX_CHARS = 120_000

# System prompt do chat conversacional (balão de IA).
CHAT_SYSTEM = (
    "Você é o Copiloto do Pulse, um assistente de gestão de projetos ágeis "
    "(boards, sprints, cards, Planning Poker). Ajude o time a organizar o trabalho: "
    "quebre ideias em tarefas, sugira prioridades e estimativas, resuma decisões, "
    "aponte riscos e dê um norte prático. Seja objetivo e responda sempre em português. "
    "Use listas curtas quando fizer sentido. Se pedirem para criar cards, descreva as "
    "tarefas sugeridas de forma clara (título, tipo, prioridade) — a criação em si é "
    "feita na aba Copiloto a partir de um documento."
)

MAX_CHAT_TOKENS = 2000

# System prompt do Copiloto agêntico — pode ler o board e propor ações.
CHAT_AGENT_SYSTEM = (
    "Você é o Copiloto do Pulse, um agente de gestão de projetos ágeis (boards, "
    "sprints, cards, transcrições de reunião). Você tem FERRAMENTAS para consultar "
    "o workspace e para PROPOR ações.\n\n"
    "Como agir:\n"
    "1. Antes de responder, use as ferramentas de leitura (list_projects, "
    "list_documents, read_document, board_summary, list_cards, list_sprints) para "
    "trabalhar com dados reais — nunca invente ids, refs ou números.\n"
    "2. Se o usuário pedir para criar/editar cards ou sprints, ou se você "
    "identificar tarefas numa transcrição, chame `propose_actions` com as ações. "
    "Elas NÃO são executadas na hora: viram um preview para o usuário confirmar. "
    "Sempre inclua uma 'reason' curta em cada ação e use o project_id correto. "
    "Ao CRIAR cards novos, deixe o status em 'todo' (omita o campo) para que "
    "apareçam no Quadro do projeto; só use 'backlog' se o usuário pedir. "
    "Depois de propor, diga ao usuário em qual projeto e coluna os cards vão entrar.\n"
    "3. Para dar 'um norte', analise o board_summary e as sprints e recomende o que "
    "priorizar, apontando riscos.\n"
    "Responda sempre em português, objetivo, com listas curtas quando ajudar. "
    "Ao propor ações, resuma em texto o que você vai criar/alterar e peça confirmação."
)

# Limite de iterações do loop de ferramentas — teto defensivo de custo/latência.
MAX_AGENT_STEPS = 6


def to_openai_tools(tools: list[dict]) -> list[dict]:
    """Converte a spec neutra de ferramentas para o formato de functions da OpenAI."""
    return [
        {
            "type": "function",
            "function": {
                "name": t["name"],
                "description": t["description"],
                "parameters": t["input_schema"],
            },
        }
        for t in tools
    ]


def parse_analysis(raw: str) -> AnalysisResult:
    """Converte o JSON retornado pela IA em AnalysisResult."""
    data = json.loads(raw or "{}")
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
