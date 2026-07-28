"""Conectores de providers externos — publicação.

Publicação REAL nas redes vive em `social_publisher.py` (API oficial de cada
provider). Aqui ficam apenas o roteamento (`publish_post`/`collect_metrics`) e
o modo simulado (`SOCIAL_SIMULATE=True`) usado por seed/demo sem credenciais.
"""
from __future__ import annotations

import hashlib
from datetime import UTC, datetime

from django.conf import settings

from contexts.integrations.infrastructure import social_publisher

SOCIAL_CHANNELS = ["instagram", "facebook", "linkedin", "x", "tiktok", "youtube"]


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
