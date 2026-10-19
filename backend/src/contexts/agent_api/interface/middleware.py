"""Porteiro da API de agentes.

Roda em TODA requisição (não só no prefixo), porque a regra principal do
documento é "nenhuma rota de escrita aceita token de agente" — inclusive as
rotas normais do Office. Request sem token de agente fora do prefixo passa
direto, sem custo além de um lookup quando há Bearer.

Ordem: identifica o agente → barra escrita (403) → barra uso fora do prefixo
(401) → escopo (403) → limite de taxa (429) → view. Toda requisição com
token (ou dentro do prefixo) vira uma linha de auditoria, inclusive as barradas.
"""
from __future__ import annotations

import time

from django.core.cache import cache
from django.http import JsonResponse

from contexts.agent_api.application.tokens import resolve_agent
from contexts.agent_api.infrastructure.models import AgentAuditLogModel

PREFIX = "/api/agentes/v1/"
PUBLIC_PATHS = {PREFIX + "health/", PREFIX + "openapi.json"}
SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
REQUIRED_SCOPE = "office:ler"
LIMIT_PER_MINUTE = 60


def _erro(status: int, codigo: str, mensagem: str, **headers) -> JsonResponse:
    resp = JsonResponse(
        {"erro": codigo, "mensagem": mensagem},
        status=status,
        json_dumps_params={"ensure_ascii": False},
    )
    for name, value in headers.items():
        resp[name] = value
    return resp


def _bearer(request) -> str | None:
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    return (token.strip() or None) if scheme.lower() == "bearer" else None


def _may_be_agent_token(token: str) -> bool:
    """Descarta sem ir ao banco os tokens que são do próprio Office: PAT
    (`t4e_pat_...`) e JWT (três partes separadas por ponto). Sem isso toda
    requisição normal pagaria um SELECT a mais."""
    return not token.startswith("t4e_pat_") and token.count(".") != 2


def _retry_after(agent_id: str) -> int | None:
    """Janela fixa de 1 minuto no cache (Redis em produção). Devolve os
    segundos até a próxima janela quando estourou, senão None."""
    now = time.time()
    window = int(now // 60)
    key = f"agent-rl:{agent_id}:{window}"
    cache.add(key, 0, timeout=61)
    try:
        count = cache.incr(key)
    except ValueError:  # chave expirou entre o add e o incr
        cache.set(key, 1, timeout=61)
        count = 1
    if count > LIMIT_PER_MINUTE:
        return max(1, int((window + 1) * 60 - now))
    return None


class AgentTokenMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        in_api = request.path.startswith(PREFIX)
        if in_api and request.path in PUBLIC_PATHS:
            return self.get_response(request)
        token = _bearer(request)
        agent = resolve_agent(token) if token and _may_be_agent_token(token) else None
        if not in_api and agent is None:
            # Fluxo normal do Office (usuário, PAT, JWT): não é da nossa conta.
            return self.get_response(request)

        resp = self._handle(request, agent, in_api)
        AgentAuditLogModel.objects.create(
            agente=agent,
            metodo=request.method[:10],
            rota=request.get_full_path()[:500],
            status=resp.status_code,
            correlation_id=request.headers.get("X-Correlation-Id", "")[:120],
        )
        return resp

    def _handle(self, request, agent, in_api: bool):
        if agent is None:
            return _erro(401, "nao_autenticado", "Token ausente, inválido ou desativado.")
        if request.method not in SAFE_METHODS:
            return _erro(403, "somente_leitura", "Agentes têm acesso somente de leitura.")
        if not in_api:
            return _erro(401, "nao_autenticado", f"Token de agente só vale em {PREFIX}.")
        if REQUIRED_SCOPE not in (agent.escopos or []):
            return _erro(403, "escopo_insuficiente", f"Token sem o escopo {REQUIRED_SCOPE}.")
        retry = _retry_after(agent.id)
        if retry:
            return _erro(
                429,
                "limite_excedido",
                f"Limite de {LIMIT_PER_MINUTE} requisições por minuto.",
                **{"Retry-After": str(retry)},
            )
        request.agent = agent
        resp = self.get_response(request)
        if resp.status_code == 404 and "application/json" not in resp.get("Content-Type", ""):
            return _erro(404, "nao_encontrado", "Rota não encontrada.")
        return resp
