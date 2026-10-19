"""Webhooks para os agentes: enfileirar (outbox) e entregar.

Formato do Leonardo:
    {"id_evento", "evento", "ocorrido_em", "recurso": {"tipo", "id"}, "dados"}
Assinatura: `X-Office-Signature` = HMAC-SHA256 hex do corpo com o segredo
combinado (`AGENT_WEBHOOK_SECRET`).
"""
from __future__ import annotations

import hashlib
import hmac
import json
from datetime import timedelta

import httpx
from django.conf import settings
from django.utils import timezone

from contexts.agent_api.infrastructure.models import AgentTokenModel, WebhookOutboxModel
from contexts.agent_api.interface.formatting import dt

GIVE_UP_AFTER = timedelta(hours=24)
FIRST_RETRY_SECONDS = 30
MAX_RETRY_SECONDS = 3600
BATCH = 50


def webhooks_enabled_for(workspace_id) -> bool:
    """Só gera evento com URL configurada e se o workspace tem agente ativo —
    dado de workspace que nenhum agente lê não sai do Office."""
    if not getattr(settings, "AGENT_WEBHOOK_URL", ""):
        return False
    return AgentTokenModel.objects.filter(ativo=True, workspaces__id=workspace_id).exists()


def enqueue(*, workspace_id, evento: str, recurso_tipo: str, recurso_id, dados: dict) -> None:
    if not webhooks_enabled_for(workspace_id):
        return
    WebhookOutboxModel.objects.create(
        evento=evento, recurso_tipo=recurso_tipo, recurso_id=str(recurso_id), dados=dados
    )


def _body(event: WebhookOutboxModel) -> bytes:
    return json.dumps(
        {
            "id_evento": str(event.id_evento),
            "evento": event.evento,
            "ocorrido_em": dt(event.ocorrido_em),
            "recurso": {"tipo": event.recurso_tipo, "id": event.recurso_id},
            "dados": event.dados,
        },
        ensure_ascii=False,
    ).encode()


def sign(body: bytes) -> str:
    secret = getattr(settings, "AGENT_WEBHOOK_SECRET", "")
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def _retry_delay(attempts: int) -> timedelta:
    return timedelta(seconds=min(FIRST_RETRY_SECONDS * 2 ** (attempts - 1), MAX_RETRY_SECONDS))


def deliver_pending(*, client: httpx.Client | None = None) -> int:
    """Entrega os eventos vencidos; devolve quantos foram aceitos (2xx)."""
    url = getattr(settings, "AGENT_WEBHOOK_URL", "")
    if not url:
        return 0
    now = timezone.now()
    pending = list(
        WebhookOutboxModel.objects.filter(
            entregue_em__isnull=True, desistiu_em__isnull=True, proxima_tentativa__lte=now
        ).order_by("ocorrido_em")[:BATCH]
    )
    own_client = client is None
    client = client or httpx.Client(timeout=10)
    delivered = 0
    try:
        for event in pending:
            body = _body(event)
            error = ""
            try:
                resp = client.post(
                    url,
                    content=body,
                    headers={"Content-Type": "application/json", "X-Office-Signature": sign(body)},
                )
                if 200 <= resp.status_code < 300:
                    event.entregue_em = timezone.now()
                    event.save(update_fields=["entregue_em"])
                    delivered += 1
                    continue
                error = f"HTTP {resp.status_code}"
            except httpx.HTTPError as exc:
                error = str(exc) or exc.__class__.__name__
            event.tentativas += 1
            event.ultimo_erro = error[:1000]
            if timezone.now() - event.ocorrido_em > GIVE_UP_AFTER:
                event.desistiu_em = timezone.now()
            else:
                event.proxima_tentativa = timezone.now() + _retry_delay(event.tentativas)
            event.save(update_fields=["tentativas", "ultimo_erro", "desistiu_em", "proxima_tentativa"])
    finally:
        if own_client:
            client.close()
    return delivered
