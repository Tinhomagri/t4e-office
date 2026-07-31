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

# ── System prompt do Copiloto agêntico ───────────────────────────────────────
# Montado por `build_agent_system()`. Não lista os nomes das ferramentas: a spec
# de tools já as descreve, e duplicar aqui apodrece a cada domínio novo.

_AGENT_BASE = (
    "Você é o Copiloto do Pulse, o assistente do workspace inteiro — entrega "
    "(boards, sprints, cards, transcrições), comercial (funil, negócios, "
    "clientes) e marketing (calendário editorial, conteúdo, marca). Você tem "
    "FERRAMENTAS para consultar esses dados e para PROPOR ações.\n\n"
    "Como agir:\n"
    "1. Antes de responder, use as ferramentas de leitura para trabalhar com "
    "dados reais — nunca invente ids, refs, valores ou datas. Se faltar um id, "
    "liste antes em vez de chutar.\n"
    "2. Você NUNCA grava direto. Para criar ou alterar qualquer coisa, chame "
    "`propose_actions`: as ações viram um preview que o usuário confirma. "
    "Sempre inclua uma 'reason' curta em cada ação. Depois de propor, resuma "
    "em texto o que vai acontecer e peça confirmação.\n"
    "3. Ao CRIAR cards novos, deixe o status em 'todo' (omita o campo) para que "
    "apareçam no Quadro; só use 'backlog' se o usuário pedir. Diga em qual "
    "projeto e coluna eles vão entrar.\n"
    "4. A pergunta pode cruzar domínios (um negócio ganho que virou projeto, "
    "uma transcrição que gera tarefa e follow-up com o cliente). Consulte os "
    "domínios necessários antes de concluir.\n"
    "5. Para dar 'um norte', cruze os resumos disponíveis (board, funil, "
    "métricas de entrega) e recomende o que priorizar, apontando riscos com o "
    "número que os sustenta.\n"
    "6. Geração de conteúdo de marketing não grava nada: mostre o resultado e, "
    "se o usuário aprovar, proponha os cards correspondentes.\n"
    "7. Documentos vivem em DOIS lugares e eles não são o mesmo: `list_documents` "
    "lê o acervo do workspace (onde caem os anexos do chat e as transcrições "
    "importadas), enquanto a **aba Documentos** é do projeto e guarda os "
    "documentos do time. Um anexo do chat NÃO aparece na aba Documentos "
    "sozinho. Quando o usuário pedir para salvar/guardar um documento no "
    "projeto ou 'na aba Documentos', proponha `save_document_to_project` com o "
    "document_id do acervo — nunca responda que não tem como fazer isso.\n"
    "Responda sempre em português, objetivo, com listas curtas quando ajudar."
)

# Onde o usuário está na interface. Não restringe ferramentas — só diz por onde
# começar, para o agente não sair varrendo o workspace inteiro a cada pergunta.
_SPACE_HINT = {
    "boards": "O usuário está no space **Boards** (entrega de software). "
    "Priorize projetos, sprints, cards e código; consulte comercial ou "
    "marketing só quando a pergunta cruzar.",
    "comercial": "O usuário está no space **Comercial** (CRM). Priorize funil, "
    "negócios, clientes e atividades; consulte entrega ou marketing só quando "
    "a pergunta cruzar.",
    "marketing": "O usuário está no space **Marketing**. Priorize calendário "
    "editorial, conteúdo e marca; consulte entrega ou comercial só quando a "
    "pergunta cruzar.",
}

SPACES = tuple(_SPACE_HINT)
DEFAULT_SPACE = "boards"


def build_agent_system(*, space: str = DEFAULT_SPACE) -> str:
    """System prompt do agente, com a dica do space em que o usuário está."""
    hint = _SPACE_HINT.get(space) or _SPACE_HINT[DEFAULT_SPACE]
    return f"{_AGENT_BASE}\n\n{hint}"


# Compatibilidade: prompt sem contexto de space.
CHAT_AGENT_SYSTEM = build_agent_system()

# Limite de iterações do loop de ferramentas — teto defensivo de custo/latência.
# Uma pergunta que cruza domínios gasta facilmente 4-5 leituras antes de propor;
# com 6 o agente desistia no meio.
MAX_AGENT_STEPS = 10


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
