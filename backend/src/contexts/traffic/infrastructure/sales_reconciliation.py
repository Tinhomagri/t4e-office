"""Conciliação de vendas — porte de vendas.ts do T4E OS.

São três fontes que ninguém desenhou para conversar entre si:
  1. a planilha de fechados (nome, telefone, valor, datas),
  2. a planilha histórica de leads (telefone, origem, nome do anúncio),
  3. o gasto por anúncio na Meta.

O elo é o telefone; o nome é a segunda tentativa, e o resultado marca quantas
vieram por aí — casamento por nome erra mais, e esconder isso seria vender
certeza que não existe.
"""
from __future__ import annotations

import threading
import time
from datetime import UTC, datetime

from django.conf import settings

from contexts.traffic.infrastructure.meta_client import MetaError, meta_get
from contexts.traffic.infrastructure.sheets import (
    ad_key,
    days_between,
    download_text,
    name_tokens,
    parse_amount,
    parse_csv,
    phone_keys,
)
from shared.domain.errors import ValidationError

# Coluna da planilha histórica que guarda o nome do anúncio.
AD_COLUMN = "utm_medium = Anúncio"

# A venda fecha 1-2 meses depois do lead: o gasto é lido desde o começo da
# operação, não pelo período da tela — recortar em 30 dias atribuiria
# faturamento a um gasto que não o gerou.
OPERATION_START = "2025-12-01"


def calculate_sales() -> dict:
    fechados_url = getattr(settings, "TRAFFIC_SHEET_FECHADOS_URL", "")
    hist_url = getattr(settings, "TRAFFIC_SHEET_HIST_URL", "")
    ad_account_id = getattr(settings, "META_AD_ACCOUNT_ID", "")

    closed = parse_csv(download_text(fechados_url) if fechados_url else "")
    history = parse_csv(download_text(hist_url) if hist_url else "")

    by_phone: dict[str, list[dict]] = {}
    for row in history:
        for key in phone_keys(row.get("TELEFONE")):
            by_phone.setdefault(key, []).append(row)

    by_ad: dict[str, dict] = {}
    by_origin: dict[str, dict] = {}
    not_found = {"vendas": 0, "faturamento": 0.0}
    closing_days: list[int] = []
    total_revenue = 0.0

    for sale in closed:
        amount = parse_amount(sale.get("Valor"))
        if not amount:
            continue

        total_revenue += amount
        days = days_between(sale.get("Data de Criacao"), sale.get("Data de Fechamento"))
        if days is not None:
            closing_days.append(days)

        lead: dict | None = None
        via = "tel"

        for key in phone_keys(sale.get("Telefone")):
            candidates = by_phone.get(key)
            if candidates:
                lead = candidates[0]
                break

        if lead is None:
            # Duas palavras em comum é o limiar que separa homônimo de coincidência.
            tokens = name_tokens(sale.get("Nome"))
            for candidate in history:
                others = name_tokens(candidate.get("NOME"))
                if len(tokens & others) >= 2:
                    lead = candidate
                    via = "nome"
                    break

        if lead is None:
            not_found["vendas"] += 1
            not_found["faturamento"] += amount
            continue

        origin = (lead.get("ORIGEM") or "?").strip()
        origin_acc = by_origin.setdefault(origin, {"vendas": 0, "faturamento": 0.0})
        origin_acc["vendas"] += 1
        origin_acc["faturamento"] += amount

        ad_name = (lead.get(AD_COLUMN) or "").strip()
        if ad_name:
            acc = by_ad.setdefault(
                ad_name, {"vendas": 0, "faturamento": 0.0, "dias": [], "via_nome": 0}
            )
            acc["vendas"] += 1
            acc["faturamento"] += amount
            if days is not None:
                acc["dias"].append(days)
            if via == "nome":
                acc["via_nome"] += 1

    # Gasto por anúncio na Meta, do começo da operação até hoje.
    spend_by_key: dict[str, float] = {}
    try:
        today = datetime.now(UTC).date().isoformat()
        insights = meta_get(
            f"{ad_account_id}/insights",
            {
                "level": "ad",
                "time_range": {"since": OPERATION_START, "until": today},
                "fields": "ad_name,spend",
                "limit": 500,
            },
        )
        for row in insights.get("data") or []:
            key = ad_key(row.get("ad_name"))
            spend_by_key[key] = spend_by_key.get(key, 0.0) + float(row.get("spend") or 0)
    except (MetaError, ValidationError):
        # Sem gasto o ROAS fica None — a conciliação em si continua valendo.
        pass

    ads = []
    for name, acc in by_ad.items():
        key = ad_key(name)
        # Prefixo em vez de igualdade: o mesmo criativo aparece na Meta como
        # "… 2026" e "… — Cópia", e cada variação carrega um pedaço do gasto.
        spend = sum(
            value
            for meta_key, value in spend_by_key.items()
            if meta_key.startswith(key) or key.startswith(meta_key)
        )
        ads.append(
            {
                "name": name,
                "vendas": acc["vendas"],
                "faturamento": acc["faturamento"],
                "ticket": acc["faturamento"] / acc["vendas"],
                "dias": round(sum(acc["dias"]) / len(acc["dias"])) if acc["dias"] else None,
                "spend": spend,
                "roas": (acc["faturamento"] / spend) if spend else None,
                "cac": (spend / acc["vendas"]) if spend else None,
                "viaNome": acc["via_nome"],
            }
        )
    ads.sort(key=lambda a: a["faturamento"], reverse=True)

    ads_revenue = sum(a["faturamento"] for a in ads)
    ads_spend = sum(a["spend"] for a in ads)
    # Gasto de TODA a conta, inclusive anúncios que não venderam nada: ROAS
    # honesto — o outro superestima olhando só pra quem deu certo.
    account_spend = sum(spend_by_key.values())

    return {
        "total": total_revenue,
        "vendas": len(closed),
        "ticket": (total_revenue / len(closed)) if closed else 0.0,
        "tempoMedio": round(sum(closing_days) / len(closing_days)) if closing_days else None,
        "origens": sorted(
            ({"origem": origin, **acc} for origin, acc in by_origin.items()),
            key=lambda o: o["faturamento"],
            reverse=True,
        ),
        "anuncios": ads,
        "naoAchado": not_found,
        "resumoAds": {
            "faturamento": ads_revenue,
            "spend": ads_spend,
            "roas": (ads_revenue / ads_spend) if ads_spend else None,
            "spendConta": account_spend,
            "roasConta": (ads_revenue / account_spend) if account_spend else None,
        },
    }


# O cruzamento alimenta três telas (anúncios, funil e vendas) e custa duas
# planilhas inteiras mais uma consulta longa à Meta. Cinco minutos de cache é
# curto o bastante pra não mostrar dado velho e longo o bastante pra uma
# navegação inteira pelo painel não repetir o trabalho. O lock garante que
# duas chamadas concorrentes não disparem o cálculo em dobro — a segunda
# espera a primeira terminar e lê o cache fresco.
_CACHE_TTL_SECONDS = 300
_cache_lock = threading.Lock()
_cached_at: float | None = None
_cached_result: dict | None = None


def cross_sales() -> dict:
    """Vendas cruzadas por anúncio + totais agregados, com cache de 5 minutos."""
    global _cached_at, _cached_result

    with _cache_lock:
        if (
            _cached_result is not None
            and _cached_at is not None
            and time.monotonic() - _cached_at < _CACHE_TTL_SECONDS
        ):
            return _cached_result

        data = calculate_sales()
        by_ad = {ad_key(ad["name"]): ad for ad in data["anuncios"]}
        result = {
            "porAnuncio": by_ad,
            "clientesViaAds": sum(ad["vendas"] for ad in data["anuncios"]),
            "faturamentoAds": data["resumoAds"]["faturamento"],
            "gastoDaConta": data["resumoAds"]["spendConta"],
            "totalDeClientes": data["vendas"],
        }
        _cached_result = result
        _cached_at = time.monotonic()
        return result


def reset_cache_for_tests() -> None:
    """Só para os testes: zera o cache de módulo entre casos."""
    global _cached_at, _cached_result
    _cached_at = None
    _cached_result = None
