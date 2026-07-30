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


def rewrite(*, workspace_id: str, text: str, action: str, instruction: str = "") -> str:
    """Aplica uma ação de reescrita ao texto e devolve o resultado."""
    if action not in ACTIONS:
        raise ValidationError(
            f"Ação inválida: {action}. Use uma de {', '.join(sorted(ACTIONS))}."
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
