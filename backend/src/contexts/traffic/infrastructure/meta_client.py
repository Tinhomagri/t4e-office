"""Cliente da Graph API da Meta (Marketing API) — porte de graph.ts do T4E OS.

O token vive só no servidor: o frontend fala com /api/traffic/* e nunca vê a
credencial.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import httpx
from django.conf import settings

from shared.domain.errors import UpstreamError, ValidationError


class MetaError(UpstreamError):
    """A Meta recusou ou falhou a consulta. `user_message` é o texto pra tela."""

    def __init__(
        self,
        message: str,
        user_message: str = "A Meta recusou a consulta. Tente novamente em instantes.",
    ) -> None:
        super().__init__(message)
        self.user_message = user_message


@dataclass(frozen=True)
class DateRange:
    since: str
    until: str


def date_range(since: str | None = None, until: str | None = None) -> DateRange:
    """Sem período informado, os últimos 30 dias."""
    if since and until:
        return DateRange(since=since, until=until)
    end = datetime.now(UTC).date()
    start = end - timedelta(days=29)
    return DateRange(since=start.isoformat(), until=end.isoformat())


def meta_get(edge: str, params: dict | None = None) -> dict:
    """Chama `graph.facebook.com/{versão}/{edge}` com o token do servidor.

    Levanta `ValidationError` se o token/conta não estiverem configurados, e
    `MetaError` se a Meta recusar a consulta ou a rede falhar.
    """
    token = getattr(settings, "META_TRAFFIC_ACCESS_TOKEN", "")
    if not token:
        raise ValidationError(
            "O módulo Tráfego não está configurado no servidor (token da Meta)."
        )
    account_id = getattr(settings, "META_AD_ACCOUNT_ID", "")
    if not account_id:
        raise ValidationError(
            "O módulo Tráfego não está configurado no servidor (conta de anúncios)."
        )
    version = getattr(settings, "META_GRAPH_VERSION", "v21.0")

    query: dict[str, str] = {"access_token": token}
    for key, value in (params or {}).items():
        if value is None:
            continue
        query[key] = value if isinstance(value, str) else json.dumps(value) if isinstance(
            value, (dict, list)
        ) else str(value)

    try:
        # Sem cache: o painel é sobre o que está acontecendo agora.
        resp = httpx.get(f"https://graph.facebook.com/{version}/{edge}", params=query, timeout=30)
    except httpx.HTTPError as exc:
        raise MetaError(f"falha de rede: {exc}", "Não consegui falar com a Meta.") from exc

    try:
        body = resp.json()
    except ValueError as exc:
        raise MetaError("resposta não é JSON") from exc

    if isinstance(body, dict) and body.get("error"):
        error = body["error"]
        expired = error.get("code") == 190
        raise MetaError(
            error.get("message") or "erro da Graph API",
            "O token da Meta expirou ou foi revogado. É preciso gerar um novo no servidor."
            if expired
            else "A Meta recusou a consulta. Tente novamente em instantes.",
        )

    return body


def action_value(actions: list[dict] | None, action_type: str) -> float:
    if not actions:
        return 0.0
    for action in actions:
        if action.get("action_type") == action_type:
            return float(action.get("value") or 0)
    return 0.0


def leads_from_row(row: dict) -> float:
    """A Meta reporta lead sob nomes diferentes conforme o formato do anúncio
    (formulário nativo, conversão no site, lead agrupado). Somar contaria em
    dobro — usa o primeiro que responder, a mesma regra que já bate com o
    Gerenciador de Anúncios."""
    actions = row.get("actions")
    return (
        action_value(actions, "lead")
        or action_value(actions, "onsite_conversion.lead_grouped")
        or action_value(actions, "offsite_complete_registration_add_meta_leads")
        or 0.0
    )
