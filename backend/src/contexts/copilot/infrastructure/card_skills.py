"""Sugestões da IA ancoradas num card — o que o Jira chama de "Melhorar tarefa".

Diferente de `writing_skills` (que devolve texto para substituir o que a pessoa
escreveu), aqui a IA devolve **propostas estruturadas**: subtarefas a criar,
cards parecidos a vincular, respostas de comentário. Nada é aplicado — quem
aplica é a pessoa, na UI, escolhendo item a item.

Stateless: lê o card e seus vizinhos, monta o prompt, devolve listas. Nada
grava no banco.
"""
from __future__ import annotations

import json
import re

from contexts.copilot.infrastructure import ai_config
from shared.domain.errors import ValidationError

# Quantos cards do projeto entram no prompt de "semelhantes". Alto o bastante
# para achar duplicata real, baixo o bastante para não estourar o contexto.
SIMILAR_POOL = 120
MAX_SUBTASKS = 6
MAX_SIMILAR = 5
MAX_REPLIES = 3

_JSON_BLOCK = re.compile(r"\[.*\]|\{.*\}", re.DOTALL)


def _parse_json(reply: str) -> object:
    """Extrai o JSON da resposta, tolerando preâmbulo e cercas de código."""
    match = _JSON_BLOCK.search(reply or "")
    if match is None:
        raise ValidationError("A IA não devolveu uma resposta utilizável. Tente de novo.")
    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError as exc:
        raise ValidationError(
            "A IA devolveu uma resposta malformada. Tente de novo."
        ) from exc


def _ask(workspace_id: str, system: str, user: str) -> object:
    reply = ai_config.chat_for_workspace(
        workspace_id, [{"role": "user", "content": user}], system=system
    )
    return _parse_json(reply)


def _card_brief(card: dict) -> str:
    parts = [f"Título: {card['title']}"]
    if card.get("description"):
        parts.append(f"Descrição: {card['description'][:2000]}")
    if card.get("type"):
        parts.append(f"Tipo: {card['type']}")
    return "\n".join(parts)


_SUBTASKS_SYSTEM = (
    "Você quebra um item de trabalho em subtarefas dentro de uma ferramenta de "
    "gestão de projetos. Responda SOMENTE com um array JSON, sem preâmbulo e sem "
    'cercas de código, no formato [{"title": "...", "reason": "..."}]. '
    "Cada título é uma ação concreta e verificável, na voz imperativa, com no "
    "máximo 80 caracteres. `reason` explica em uma linha por que essa subtarefa "
    "existe. Mantenha o idioma do card."
)


def suggest_subtasks(*, workspace_id: str, card: dict) -> list[dict]:
    """Propõe subtarefas para o card. Não cria nada — só devolve as propostas."""
    if not (card.get("title") or "").strip():
        raise ValidationError("O card precisa de um título antes de sugerir subtarefas.")

    user = (
        f"Quebre este item em no máximo {MAX_SUBTASKS} subtarefas. Se o item já "
        "for pequeno o bastante, devolva menos — ou um array vazio.\n\n"
        f"{_card_brief(card)}"
    )
    data = _ask(workspace_id, _SUBTASKS_SYSTEM, user)
    if not isinstance(data, list):
        raise ValidationError("A IA não devolveu uma lista de subtarefas.")

    out: list[dict] = []
    for row in data[:MAX_SUBTASKS]:
        if not isinstance(row, dict):
            continue
        title = str(row.get("title") or "").strip()[:200]
        if title:
            out.append({"title": title, "reason": str(row.get("reason") or "").strip()})
    return out


_SIMILAR_SYSTEM = (
    "Você encontra itens de trabalho relacionados dentro de uma ferramenta de "
    "gestão de projetos. Responda SOMENTE com um array JSON, sem preâmbulo e sem "
    'cercas de código, no formato [{"ref": "...", "relation": "duplicates|blocks|relates", '
    '"reason": "..."}]. Use apenas refs presentes na lista fornecida. Se nenhum '
    "item for de fato relacionado, devolva um array vazio — não force relação."
)

_RELATIONS = {"duplicates", "blocks", "relates"}


def suggest_similar(*, workspace_id: str, card: dict, candidates: list[dict]) -> list[dict]:
    """Aponta, entre os candidatos, quais cards se relacionam com este.

    `candidates` são cards do mesmo projeto, cada um com `ref` e `title`. A IA
    só pode escolher entre eles — por isso a resposta é filtrada contra a lista.
    """
    pool = candidates[:SIMILAR_POOL]
    if not pool:
        return []

    listing = "\n".join(f"- {c['ref']}: {c['title']}" for c in pool)
    user = (
        f"Item de referência:\n{_card_brief(card)}\n\n"
        f"Itens candidatos do mesmo projeto:\n{listing}\n\n"
        f"Aponte no máximo {MAX_SIMILAR} itens genuinamente relacionados."
    )
    data = _ask(workspace_id, _SIMILAR_SYSTEM, user)
    if not isinstance(data, list):
        raise ValidationError("A IA não devolveu uma lista de itens semelhantes.")

    by_ref = {c["ref"]: c for c in pool}
    out: list[dict] = []
    seen: set[str] = set()
    for row in data[:MAX_SIMILAR]:
        if not isinstance(row, dict):
            continue
        ref = str(row.get("ref") or "").strip()
        # A IA às vezes inventa um ref plausível; só passa o que existe mesmo.
        if ref not in by_ref or ref in seen:
            continue
        seen.add(ref)
        relation = str(row.get("relation") or "relates")
        out.append({
            "ref": ref,
            "card_id": by_ref[ref]["id"],
            "title": by_ref[ref]["title"],
            "relation": relation if relation in _RELATIONS else "relates",
            "reason": str(row.get("reason") or "").strip(),
        })
    return out


_REPLIES_SYSTEM = (
    "Você sugere respostas curtas para uma conversa em um item de trabalho. "
    "Responda SOMENTE com um array JSON de strings, sem preâmbulo e sem cercas "
    "de código. Cada resposta tem no máximo 240 caracteres, soa como uma pessoa "
    "do time falando, e não inventa fatos nem promete prazo. Mantenha o idioma "
    "da conversa."
)


def suggest_replies(*, workspace_id: str, card: dict, comments: list[dict]) -> list[str]:
    """Propõe respostas para o último comentário do card."""
    if not comments:
        return []

    thread = "\n".join(
        f"{c.get('author') or 'Alguém'}: {(c.get('body') or '').strip()[:600]}"
        for c in comments[-8:]
    )
    user = (
        f"Item:\n{_card_brief(card)}\n\n"
        f"Conversa até aqui:\n{thread}\n\n"
        f"Sugira até {MAX_REPLIES} respostas distintas entre si para a última mensagem."
    )
    data = _ask(workspace_id, _REPLIES_SYSTEM, user)
    if not isinstance(data, list):
        raise ValidationError("A IA não devolveu uma lista de respostas.")

    return [
        str(row).strip()[:240]
        for row in data[:MAX_REPLIES]
        if isinstance(row, str) and str(row).strip()
    ]
