"""Serviço de configuração de IA por workspace + fábrica de analisadores.

Guarda o provedor + a chave (cifrada) que cada workspace usa, e constrói o
`AiAnalyzer` correspondente na hora de analisar um documento.
"""
from contexts.copilot.domain.ports.ai_analyzer import AiAnalyzer
from contexts.copilot.infrastructure import ai_prompt
from contexts.copilot.infrastructure.anthropic_analyzer import AnthropicAnalyzer
from contexts.copilot.infrastructure.django import crypto
from contexts.copilot.infrastructure.django.models import WorkspaceAiConfigModel
from contexts.copilot.infrastructure.gemini_analyzer import GeminiAnalyzer
from contexts.copilot.infrastructure.openai_analyzer import OpenAiAnalyzer
from shared.domain.errors import ValidationError

PROVIDERS = {
    "anthropic": {"label": "Anthropic (Claude)", "default_model": "claude-opus-4-8"},
    "openai": {"label": "OpenAI", "default_model": "gpt-4o"},
    "google": {"label": "Google (Gemini)", "default_model": "gemini-2.5-pro"},
}


def get_config(workspace_id: str) -> WorkspaceAiConfigModel | None:
    return WorkspaceAiConfigModel.objects.filter(workspace_id=workspace_id).first()


def config_public_dict(cfg: WorkspaceAiConfigModel | None) -> dict:
    """Representação segura p/ a API — nunca devolve a chave em texto puro."""
    if cfg is None:
        return {
            "provider": "anthropic",
            "model": "",
            "is_active": True,
            "configured": False,
            "key_hint": "",
            "updated_at": None,
        }
    hint = ""
    try:
        plain = crypto.decrypt(cfg.api_key_encrypted)
        if plain:
            hint = f"••••{plain[-4:]}" if len(plain) >= 4 else "••••"
    except Exception:
        hint = "••••"
    return {
        "provider": cfg.provider,
        "model": cfg.model,
        "is_active": cfg.is_active,
        "configured": bool(cfg.api_key_encrypted),
        "key_hint": hint,
        "updated_at": cfg.updated_at.isoformat() if cfg.updated_at else None,
    }


def save_config(
    *,
    workspace_id: str,
    provider: str,
    model: str,
    api_key: str | None,
    is_active: bool,
    updated_by_id: str,
) -> WorkspaceAiConfigModel:
    if provider not in PROVIDERS:
        raise ValidationError("Provedor de IA inválido.")

    cfg = WorkspaceAiConfigModel.objects.filter(workspace_id=workspace_id).first()
    resolved_model = model.strip() or PROVIDERS[provider]["default_model"]

    if cfg is None:
        cfg = WorkspaceAiConfigModel(workspace_id=workspace_id)

    cfg.provider = provider
    cfg.model = resolved_model
    cfg.is_active = is_active
    cfg.updated_by_id = updated_by_id
    # Chave só é reescrita quando enviada; envio vazio mantém a atual.
    if api_key:
        cfg.api_key_encrypted = crypto.encrypt(api_key.strip())
    cfg.save()
    return cfg


def build_analyzer(cfg: WorkspaceAiConfigModel) -> AiAnalyzer:
    """Constrói o analisador do provedor configurado, com a chave decifrada."""
    api_key = crypto.decrypt(cfg.api_key_encrypted)
    if cfg.provider == "openai":
        return OpenAiAnalyzer(api_key=api_key, model=cfg.model)
    if cfg.provider == "google":
        return GeminiAnalyzer(api_key=api_key, model=cfg.model)
    return AnthropicAnalyzer(api_key=api_key, model=cfg.model)


def build_analyzer_for_workspace(workspace_id: str) -> AiAnalyzer:
    cfg = get_config(workspace_id)
    if cfg is None or not cfg.api_key_encrypted:
        raise ValidationError(
            "Este workspace ainda não tem a IA configurada. "
            "Um administrador precisa adicionar uma chave de API em Copiloto → Integração de IA."
        )
    if not cfg.is_active:
        raise ValidationError("A integração de IA deste workspace está desativada.")
    return build_analyzer(cfg)


def chat_for_workspace(
    workspace_id: str, messages: list[dict], *, system: str | None = None
) -> str:
    """Conversa livre com a IA configurada do workspace.

    `system` troca o prompt de sistema padrão (o do Copiloto conversacional) —
    é o que permite reaproveitar a mesma IA para tarefas de formato fechado,
    como reescrever a descrição de um card.
    """
    return build_analyzer_for_workspace(workspace_id).chat(
        messages=messages, system=system
    )


def agent_chat_for_workspace(
    workspace_id: str,
    actor_id: str,
    messages: list[dict],
    *,
    space: str = ai_prompt.DEFAULT_SPACE,
) -> dict:
    """Chat agêntico: a IA lê o workspace e propõe ações (preview p/ confirmação).

    O catálogo de ferramentas cobre todos os domínios; `space` só diz por onde
    o agente deve começar a olhar.

    Retorna {"reply": str, "pending_actions": list[dict]}.
    """
    from contexts.copilot.infrastructure.agent.registry import AgentTools

    analyzer = build_analyzer_for_workspace(workspace_id)
    tools = AgentTools(workspace_id=workspace_id, actor_id=actor_id)
    return analyzer.chat_agent(
        messages=messages,
        tools=tools.all_tools(),
        read_executor=tools.execute_read,
        system=ai_prompt.build_agent_system(space=space),
    )
