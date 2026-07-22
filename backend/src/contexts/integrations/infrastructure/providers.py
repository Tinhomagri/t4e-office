"""Conectores de providers externos — publicação e import.

Publicação REAL nas redes vive em `social_publisher.py` (API oficial de cada
provider). Aqui ficam apenas o roteamento (`publish_post`/`collect_metrics`) e
o modo simulado (`SOCIAL_SIMULATE=True`) usado por seed/demo sem credenciais.

Parsers de import aceitam o JSON de export nativo de cada ferramenta:
* Jira — export de busca (`issues: [{key, fields: {summary, status, ...}}]`).
* Trello — export de board (`cards: [...]`, `lists: [...]`).
"""
from __future__ import annotations

import hashlib
from datetime import UTC, datetime

from django.conf import settings

from contexts.integrations.infrastructure import social_publisher

SOCIAL_CHANNELS = ["instagram", "facebook", "linkedin", "x", "tiktok", "youtube"]

# Mapeamento padrão de status externos → status do card
_JIRA_STATUS_MAP = {
    "to do": "todo",
    "a fazer": "todo",
    "backlog": "backlog",
    "in progress": "doing",
    "em andamento": "doing",
    "in review": "review",
    "em revisão": "review",
    "done": "done",
    "concluído": "done",
    "concluido": "done",
}
_JIRA_TYPE_MAP = {
    "bug": "bug",
    "story": "feature",
    "história": "feature",
    "task": "chore",
    "tarefa": "chore",
    "epic": "epic",
    "épico": "epic",
}


def _seed(value: str) -> int:
    return int(hashlib.sha256(value.encode()).hexdigest()[:8], 16)


def publish_post(post) -> dict:
    """Publica o post na rede real (ou simula se SOCIAL_SIMULATE). {external_id}.

    Levanta `social_publisher.PublishError` quando a publicação real falha —
    a view captura e marca o post como `failed` com a mensagem.
    """
    if getattr(settings, "SOCIAL_SIMULATE", False):
        channel = post.account.channel
        return {"external_id": f"{channel}_{str(post.id)[:8]}"}
    return social_publisher.publish_post(post)


def collect_metrics(post) -> dict:
    """Coleta métricas do post (reais da API, ou simuladas se SOCIAL_SIMULATE)."""
    if not getattr(settings, "SOCIAL_SIMULATE", False):
        return social_publisher.collect_metrics(post)
    return _simulate_metrics(post)


def _simulate_metrics(post) -> dict:
    """Métricas simuladas determinísticas (seed/demo). Crescem com o tempo."""
    seed = _seed(str(post.id))
    hours = 1.0
    if post.published_at:
        delta = datetime.now(UTC) - post.published_at
        hours = max(1.0, min(delta.total_seconds() / 3600, 168.0))
    impressions = int((500 + seed % 4500) * (hours**0.5))
    engagement = 0.02 + (seed % 70) / 1000  # 2%–9%
    likes = int(impressions * engagement)
    return {
        "impressions": impressions,
        "likes": likes,
        "comments": int(likes * 0.15),
        "shares": int(likes * 0.08),
        "clicks": int(impressions * 0.03),
    }


def parse_jira(payload: dict) -> list[dict]:
    """Extrai itens de um export Jira (JSON de busca de issues)."""
    issues = payload.get("issues") or []
    items = []
    for issue in issues:
        fields = issue.get("fields") or {}
        status_name = ((fields.get("status") or {}).get("name") or "").lower()
        type_name = ((fields.get("issuetype") or {}).get("name") or "").lower()
        items.append(
            {
                "external_key": issue.get("key") or "",
                "title": fields.get("summary") or "(sem título)",
                "description": fields.get("description") or "",
                "status": _JIRA_STATUS_MAP.get(status_name, "todo"),
                "type": _JIRA_TYPE_MAP.get(type_name, "chore"),
                "external_status": status_name,
            }
        )
    return items


def parse_trello(payload: dict) -> list[dict]:
    """Extrai itens de um export Trello (JSON de board)."""
    lists = {lst.get("id"): (lst.get("name") or "").lower() for lst in payload.get("lists") or []}
    # Heurística: nome da lista → status do card
    def status_for(list_name: str) -> str:
        for token, st in (
            ("done", "done"), ("concluí", "done"), ("feito", "done"),
            ("review", "review"), ("revis", "review"),
            ("doing", "doing"), ("andamento", "doing"), ("progress", "doing"),
            ("backlog", "backlog"),
        ):
            if token in list_name:
                return st
        return "todo"

    items = []
    for card in payload.get("cards") or []:
        if card.get("closed"):
            continue
        list_name = lists.get(card.get("idList"), "")
        items.append(
            {
                "external_key": card.get("shortLink") or card.get("id") or "",
                "title": card.get("name") or "(sem título)",
                "description": card.get("desc") or "",
                "status": status_for(list_name),
                "type": "chore",
                "external_status": list_name,
            }
        )
    return items


def parse_import(provider: str, payload: dict) -> list[dict]:
    if provider == "jira":
        return parse_jira(payload)
    if provider == "trello":
        return parse_trello(payload)
    raise ValueError(f"Provider de import desconhecido: {provider}")
