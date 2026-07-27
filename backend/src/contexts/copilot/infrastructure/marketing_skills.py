"""Habilidades de marketing do Copiloto — geração de copy, campanha e repurpose.

Extraído das views para que a mesma lógica sirva a dois consumidores:

* os endpoints `/api/copilot/generate-copy|generate-campaign|repurpose/`;
* as ferramentas do agente (`mkt_*`), que antes não enxergavam nada disso.

Tudo aqui é *stateless*: monta o prompt, chama a IA do workspace e devolve o
resultado parseado. Nada grava no banco e nada é publicado.
"""
from __future__ import annotations

import json
import re

from contexts.copilot.infrastructure import ai_config, brand_kit

CHANNEL_TONE = {
    "instagram": "leve, direto, com gancho forte na primeira linha e CTA; até 3 hashtags relevantes",
    "facebook": "conversacional e próximo, foco em engajamento",
    "linkedin": "profissional e informativo, sem hashtags em excesso, storytelling corporativo",
    "tiktok": "descontraído, jovem, frases curtas com gancho imediato",
    "youtube": "descrição clara com palavras-chave e CTA de inscrição",
    "blog": "título SEO + meta descrição de até 155 caracteres",
    "email": "assunto curto que gera abertura + preview text complementar",
    "site": "texto institucional claro e objetivo",
}

TONE_HINT = {
    "": "",
    "institucional": "tom institucional, sério e confiável",
    "descontraido": "tom descontraído e bem-humorado",
    "urgente": "tom de urgência/escassez com CTA forte",
    "educativo": "tom educativo, didático, que ensina algo",
    "inspirador": "tom inspirador e aspiracional",
}


def extract_variations(raw: str, limit: int = 3) -> list[str]:
    """Extrai a lista de variações da resposta da IA (JSON, com fallback)."""
    match = re.search(r"\[.*\]", raw, flags=re.DOTALL)
    if match:
        try:
            parsed = json.loads(match.group(0))
            variations = [str(v).strip() for v in parsed if str(v).strip()]
            if variations:
                return variations[:limit]
        except (json.JSONDecodeError, TypeError):
            pass
    # Fallback: blocos separados por linha em branco
    blocks = [b.strip() for b in raw.split("\n\n") if b.strip()]
    return blocks[:limit] if blocks else [raw.strip()]


def extract_pieces(raw: str) -> list[dict]:
    """Extrai a lista de peças da campanha (array JSON de objetos)."""
    match = re.search(r"\[.*\]", raw, flags=re.DOTALL)
    if not match:
        return []
    try:
        parsed = json.loads(match.group(0))
    except (json.JSONDecodeError, TypeError):
        return []
    if not isinstance(parsed, list):
        return []
    pieces = []
    for item in parsed:
        if not isinstance(item, dict):
            continue
        pieces.append(
            {
                "channel": str(item.get("channel", "")).lower().strip(),
                "title": str(item.get("title", "")).strip(),
                "copy": str(item.get("copy", "")).strip(),
                "publish_date": str(item.get("publish_date", "")).strip() or None,
                "format_hint": str(item.get("format_hint", "")).strip(),
            }
        )
    return [p for p in pieces if p["title"] and p["channel"]]


def _ask(workspace_id: str, parts: list[str]) -> str:
    """Prefixa o kit de marca e envia o prompt à IA configurada do workspace."""
    brand = brand_kit.brand_prompt_snippet(workspace_id)
    if brand:
        parts = [parts[0], brand, *parts[1:]]
    prompt = "\n".join(parts)
    return ai_config.chat_for_workspace(
        workspace_id, [{"role": "user", "content": prompt}]
    )


def _channel_lines(channels: list[str]) -> str:
    return "\n".join(
        f"- {ch}: tom {CHANNEL_TONE.get(ch, 'adequado ao canal')}" for ch in channels
    )


def normalize_channels(channels: list[str]) -> list[str]:
    return [c.lower().strip() for c in channels if c and c.strip()]


def generate_copy(
    *,
    workspace_id: str,
    title: str,
    description: str = "",
    channel: str = "instagram",
    tone: str = "",
    include_hashtags: bool | None = None,
    count: int = 3,
    source_copy: str = "",
) -> dict:
    """Gera N variações de copy para um canal. Devolve {channel, variations}."""
    channel = (channel or "instagram").lower()
    parts = [
        "Você é um copywriter sênior de marketing digital escrevendo em "
        "português do Brasil.",
        f"Canal: {channel} — tom "
        f"{CHANNEL_TONE.get(channel, 'adequado ao canal informado')}.",
    ]
    if tone:
        parts.append(f"Tom de voz obrigatório: {TONE_HINT.get(tone, tone)}.")
    if include_hashtags is True:
        parts.append("Inclua hashtags relevantes ao final de cada variação.")
    elif include_hashtags is False:
        parts.append("NÃO use hashtags em nenhuma variação.")
    parts.append(f"Tema/título do conteúdo: {title}")
    if description:
        parts.append(f"Briefing/descrição: {description}")
    if source_copy:
        # Modo adaptação: reescreve uma copy existente para o canal de destino
        parts.append(
            "Copy original a ser ADAPTADA para o canal acima (preserve a "
            f"mensagem central, ajuste formato e linguagem):\n{source_copy}"
        )
        parts.append(
            f"\nEscreva {count} adaptações prontas para publicar nesse canal."
        )
    else:
        parts.append(
            f"\nEscreva {count} variações de copy prontas para publicar nesse "
            "canal, com abordagens diferentes entre si (ex.: emocional, "
            "informativa, CTA agressivo)."
        )
    parts.append(
        f"Responda APENAS com um array JSON de {count} strings, sem nenhum "
        "texto fora do JSON."
    )
    raw = _ask(workspace_id, parts)
    return {"channel": channel, "variations": extract_variations(raw, limit=count)}


def generate_campaign(
    *,
    workspace_id: str,
    brief: str,
    channels: list[str],
    start_date: str,
    end_date: str,
    per_channel: int = 1,
    tone: str = "",
) -> dict:
    """Monta um plano de campanha multicanal. Devolve {pieces}."""
    channels = normalize_channels(channels)
    total = len(channels) * per_channel
    parts = [
        "Você é um estrategista de marketing digital sênior escrevendo em "
        "português do Brasil.",
        "A partir do briefing abaixo, monte um plano de campanha multicanal.",
        f"\nBriefing:\n{brief}",
        f"\nCanais e tom de cada um:\n{_channel_lines(channels)}",
        f"\nGere exatamente {per_channel} peça(s) por canal ({total} no total).",
        f"Distribua as datas de publicação entre {start_date} e {end_date} "
        "(inclusive), seguindo boa prática de cadência: não empilhe duas peças "
        "do mesmo canal no mesmo dia e escalone ao longo da janela.",
    ]
    if tone:
        parts.append(f"Tom de voz geral obrigatório: {TONE_HINT.get(tone, tone)}.")
    parts.append(
        "Responda APENAS com um array JSON de objetos, sem texto fora do JSON. "
        'Cada objeto: {"channel": <um dos canais>, "title": <título curto '
        'da peça>, "copy": <copy pronta para publicar no canal>, '
        '"publish_date": <YYYY-MM-DD dentro da janela>, "format_hint": '
        "<formato sugerido, ex.: Reels, Carrossel, Newsletter>}."
    )
    raw = _ask(workspace_id, parts)
    # Mantém só peças em canais pedidos e datas dentro da janela.
    pieces = [
        p
        for p in extract_pieces(raw)
        if p["channel"] in channels
        and (p["publish_date"] is None or start_date <= p["publish_date"] <= end_date)
    ]
    return {"pieces": pieces}


def repurpose(
    *,
    workspace_id: str,
    title: str,
    source_copy: str,
    channels: list[str],
    tone: str = "",
) -> dict:
    """Adapta uma peça aprovada para outros canais. Devolve {pieces}."""
    channels = normalize_channels(channels)
    parts = [
        "Você é um copywriter sênior de marketing digital escrevendo em "
        "português do Brasil.",
        f"Peça original (título: {title}):\n{source_copy}",
        "\nAdapte essa MESMA mensagem central para cada canal abaixo, ajustando "
        f"formato e linguagem:\n{_channel_lines(channels)}",
    ]
    if tone:
        parts.append(f"Tom de voz obrigatório: {TONE_HINT.get(tone, tone)}.")
    parts.append(
        "Responda APENAS com um array JSON de objetos, um por canal, sem texto "
        'fora do JSON. Cada objeto: {"channel": <um dos canais>, "title": '
        '<título curto da peça>, "copy": <copy adaptada pronta para publicar>, '
        '"format_hint": <formato sugerido>}.'
    )
    raw = _ask(workspace_id, parts)
    pieces = [p for p in extract_pieces(raw) if p["channel"] in channels]
    return {"pieces": pieces}
