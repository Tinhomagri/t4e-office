"""Envelope `{dados, meta}` + paginação por cursor em (updated_at, id).

Cursor em vez de página: com dados mudando entre uma chamada e outra, página
N+1 pula ou repete item; o cursor continua exatamente depois do último visto.
Ordem por `updated_at` casa com o `updated_since` — o agente sincroniza
incrementalmente guardando o último `atualizado_em`."""
from __future__ import annotations

import base64
from collections.abc import Callable, Iterable

from django.db.models import Q
from django.utils.dateparse import parse_datetime
from rest_framework.request import Request
from rest_framework.response import Response

from shared.domain.errors import ValidationError

DEFAULT_LIMIT = 50
MAX_LIMIT = 200


def parse_limit(request: Request) -> int:
    raw = request.query_params.get("limit")
    if raw is None:
        return DEFAULT_LIMIT
    try:
        value = int(raw)
    except ValueError as exc:
        raise ValidationError("`limit` precisa ser um número.") from exc
    return max(1, min(value, MAX_LIMIT))


def parse_datetime_param(request: Request, name: str):
    raw = request.query_params.get(name)
    if not raw:
        return None
    # "+" do fuso vira espaço quando o cliente não codifica a URL.
    value = parse_datetime(raw.replace(" ", "+"))
    if value is None:
        raise ValidationError(f"`{name}` precisa ser data-hora ISO 8601.")
    return value


def parse_updated_since(request: Request):
    return parse_datetime_param(request, "updated_since")


def _encode(updated_at, pk) -> str:
    return base64.urlsafe_b64encode(f"{updated_at.isoformat()}|{pk}".encode()).decode()


def _decode(cursor: str):
    try:
        raw = base64.urlsafe_b64decode(cursor.encode()).decode()
        stamp, pk = raw.split("|", 1)
        when = parse_datetime(stamp)
    except Exception as exc:  # noqa: BLE001 — qualquer lixo no cursor é 400
        raise ValidationError("`cursor` inválido.") from exc
    if when is None:
        raise ValidationError("`cursor` inválido.")
    return when, pk


def paginate(
    request: Request,
    qs,
    serialize: Callable,
    *,
    order_field: str = "updated_at",
) -> Response:
    """Pagina um QuerySet. `serialize(lista_de_objetos) -> lista_de_dicts`
    (recebe a página inteira pra poder anotar em lote, sem N+1)."""
    limit = parse_limit(request)
    since = parse_updated_since(request)
    if since is not None:
        qs = qs.filter(**{f"{order_field}__gte": since})
    total = qs.count()
    cursor = request.query_params.get("cursor")
    if cursor:
        when, pk = _decode(cursor)
        qs = qs.filter(Q(**{f"{order_field}__gt": when}) | Q(**{order_field: when, "pk__gt": pk}))
    page = list(qs.order_by(order_field, "pk")[: limit + 1])
    has_more = len(page) > limit
    page = page[:limit]
    next_cursor = (
        _encode(getattr(page[-1], order_field), page[-1].pk) if has_more and page else None
    )
    return Response(
        {"dados": serialize(page), "meta": {"proximo_cursor": next_cursor, "total": total}}
    )


def paginate_rows(request: Request, rows: Iterable[dict], *, key: str = "_ordem") -> Response:
    """Mesmo contrato do `paginate`, para listas já montadas em memória (ex.:
    `/horas` junta duas tabelas). Cada linha traz `key` = (updated_at, id),
    removida da saída."""
    limit = parse_limit(request)
    since = parse_updated_since(request)
    rows = [r for r in rows if since is None or r[key][0] >= since]
    rows.sort(key=lambda r: (r[key][0], str(r[key][1])))
    total = len(rows)
    cursor = request.query_params.get("cursor")
    if cursor:
        when, pk = _decode(cursor)
        rows = [r for r in rows if (r[key][0], str(r[key][1])) > (when, pk)]
    page = rows[: limit + 1]
    has_more = len(page) > limit
    page = page[:limit]
    next_cursor = _encode(*page[-1][key]) if has_more and page else None
    return Response(
        {
            "dados": [{k: v for k, v in r.items() if k != key} for r in page],
            "meta": {"proximo_cursor": next_cursor, "total": total},
        }
    )
