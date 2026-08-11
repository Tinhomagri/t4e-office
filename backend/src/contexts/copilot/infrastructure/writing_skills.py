"""Assistência de escrita da IA — reescreve o texto de descrições e comentários.

É o que o Jira chama de "AI writing assistant" no editor: em vez de conversar,
o usuário seleciona uma ação (melhorar, resumir, expandir…) e recebe o texto
reescrito de volta, pronto para substituir o que estava lá.

Stateless como `marketing_skills`: monta o prompt, chama a IA do workspace e
devolve texto. Nada grava no banco.
"""
from __future__ import annotations

import re

from contexts.copilot.infrastructure import ai_config
from shared.domain.errors import ValidationError

# Cada ação vira uma instrução de sistema. Manter o catálogo fechado (em vez de
# aceitar prompt livre do cliente) evita que o campo de descrição vire um canal
# aberto para a IA do workspace.
ACTIONS: dict[str, str] = {
    "improve": (
        "Melhore a redação do texto: corrija erros, deixe mais claro e objetivo. "
        "Preserve o sentido, o idioma e todos os fatos. Não invente informação."
    ),
    "summarize": (
        "Resuma o texto nos pontos essenciais, em no máximo um terço do tamanho "
        "original. Preserve o idioma e não invente informação."
    ),
    "expand": (
        "Expanda o texto detalhando o que já está dito, deixando-o mais completo "
        "e acionável. Preserve o idioma e não invente fatos novos — apenas "
        "desenvolva o que o texto já afirma."
    ),
    "shorten": (
        "Encurte o texto mantendo toda a informação relevante. Corte redundância "
        "e rodeio. Preserve o idioma."
    ),
    "fix_grammar": (
        "Corrija apenas ortografia, gramática e pontuação. Não reescreva o estilo "
        "nem mude as palavras além do necessário. Preserve o idioma."
    ),
    "to_bullets": (
        "Reescreva o texto como uma lista de tópicos curtos, um por linha, "
        "começando cada linha com '- '. Preserve o idioma e a informação."
    ),
    "acceptance_criteria": (
        "A partir do texto, escreva critérios de aceite verificáveis no formato "
        "'- Dado … Quando … Então …', um por linha. Responda apenas com a lista. "
        "Preserve o idioma do texto."
    ),
    # Tom e tradução dependem de um alvo escolhido pela pessoa, que chega em
    # `target` — sem ele a ação não tem o que fazer, por isso são validados
    # à parte em `rewrite`.
    "change_tone": (
        "Reescreva o texto no tom pedido, preservando o idioma, todos os fatos "
        "e a estrutura. Mude registro e escolha de palavras, não o conteúdo."
    ),
    "translate": (
        "Traduza o texto para o idioma pedido. Preserve formatação, listas, "
        "termos técnicos e nomes próprios. Responda apenas com a tradução."
    ),
}

# Ações que exigem um alvo (tom ou idioma) — o catálogo de destinos também é
# fechado para não abrir a ação a instrução livre do cliente.
TONES: dict[str, str] = {
    "professional": "profissional e neutro",
    "casual": "casual e conversacional",
    "empathetic": "empático e acolhedor",
    "direct": "direto e assertivo, sem rodeios",
    "educational": "didático, explicando o porquê de cada ponto",
}

LANGUAGES: dict[str, str] = {
    "pt-BR": "português do Brasil",
    "en": "inglês",
    "es": "espanhol",
    "fr": "francês",
    "de": "alemão",
    "it": "italiano",
}

_TARGETS: dict[str, dict[str, str]] = {
    "change_tone": TONES,
    "translate": LANGUAGES,
}

MAX_INPUT_CHARS = 8000

_SYSTEM = (
    "Você é um assistente de escrita dentro de uma ferramenta de gestão de projetos. "
    "Responda SOMENTE com o texto reescrito, sem preâmbulo, sem comentários seus, "
    "sem cercas de código e sem aspas em volta. Mantenha o idioma do texto original."
)

# A IA às vezes devolve o texto embrulhado em ``` mesmo instruída a não fazer.
_FENCE = re.compile(r"^\s*```[a-zA-Z]*\n(.*?)\n?```\s*$", re.DOTALL)


def _strip_fence(text: str) -> str:
    match = _FENCE.match(text)
    return match.group(1) if match else text.strip()


def rewrite(
    *,
    workspace_id: str,
    text: str,
    action: str,
    instruction: str = "",
    target: str = "",
) -> str:
    """Aplica uma ação de reescrita ao texto e devolve o resultado.

    `target` é o alvo das ações que precisam de um: o tom (`change_tone`) ou o
    idioma (`translate`). Ignorado pelas demais.
    """
    if action not in ACTIONS:
        raise ValidationError(
            f"Ação inválida: {action}. Use uma de {', '.join(sorted(ACTIONS))}."
        )
    choices = _TARGETS.get(action)
    if choices is not None and target not in choices:
        raise ValidationError(
            f"Alvo inválido para {action}: {target or '(vazio)'}. "
            f"Use um de {', '.join(sorted(choices))}."
        )
    content = (text or "").strip()
    if not content:
        raise ValidationError("Escreva algo antes de pedir ajuda à IA.")
    if len(content) > MAX_INPUT_CHARS:
        raise ValidationError(
            f"Texto longo demais ({len(content)} caracteres). "
            f"O limite é {MAX_INPUT_CHARS}."
        )

    task = ACTIONS[action]
    if choices is not None:
        task = f"{task}\n\nAlvo: {choices[target]}."
    # `instruction` é o pedido livre do usuário ("deixe mais formal"), anexado
    # como contexto — a ação escolhida continua mandando no formato da saída.
    if instruction.strip():
        task = f"{task}\n\nPedido adicional do usuário: {instruction.strip()}"

    # O system vai no parâmetro, não como mensagem: a Anthropic recusa
    # `role: "system"` na lista e o prompt do Copiloto conversacional venceria,
    # devolvendo um bate-papo em vez do texto reescrito.
    reply = ai_config.chat_for_workspace(
        workspace_id,
        [{"role": "user", "content": f"{task}\n\n---\n{content}"}],
        system=_SYSTEM,
    )
    return _strip_fence(reply)
