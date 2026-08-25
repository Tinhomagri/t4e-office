"""Relatórios de tráfego — porte de relatorios.ts do T4E OS.

Cinco consultas leem só a Meta Ads API; funil cruza planilha de leads com a
Meta; vendas (a sétima) mora em `sales_reconciliation.py`.
"""
from __future__ import annotations

import re
from urllib.parse import unquote

from django.conf import settings

from contexts.traffic.infrastructure.geography import STATE_CENTROID, state_for
from contexts.traffic.infrastructure.meta_client import DateRange, leads_from_row, meta_get
from contexts.traffic.infrastructure.sales_reconciliation import cross_sales
from contexts.traffic.infrastructure.sheets import (
    ad_key,
    download_text,
    iso_date,
    parse_csv,
    strip_accents,
)
from shared.domain.errors import ValidationError


def _range_dict(date_range: DateRange) -> dict:
    return {"since": date_range.since, "until": date_range.until}


def _ad_account_id() -> str:
    return getattr(settings, "META_AD_ACCOUNT_ID", "")


def overview(date_range: DateRange) -> dict:
    response = meta_get(
        f"{_ad_account_id()}/insights",
        {
            "time_range": {"since": date_range.since, "until": date_range.until},
            "fields": "spend,impressions,clicks,ctr,cpc,actions",
        },
    )
    row = (response.get("data") or [{}])[0]
    spend = float(row.get("spend") or 0)
    leads = leads_from_row(row)
    return {
        "range": _range_dict(date_range),
        "spend": spend,
        "impressions": int(float(row.get("impressions") or 0)),
        "clicks": int(float(row.get("clicks") or 0)),
        "ctr": float(row.get("ctr") or 0),
        "cpc": float(row.get("cpc") or 0),
        "leads": leads,
        "cpl": (spend / leads) if leads else 0.0,
    }


def daily_series(date_range: DateRange) -> list[dict]:
    response = meta_get(
        f"{_ad_account_id()}/insights",
        {
            "time_range": {"since": date_range.since, "until": date_range.until},
            "time_increment": 1,
            "fields": "spend,actions",
        },
    )
    return [
        {
            "date": row.get("date_start", ""),
            "spend": float(row.get("spend") or 0),
            "leads": leads_from_row(row),
        }
        for row in response.get("data") or []
    ]


_CREATIVE_FIELDS = (
    "creative{thumbnail_url,image_url,object_type,"
    "object_story_spec{video_data{image_url},link_data{picture}}}"
)


def _best_image(creative: dict | None) -> str | None:
    """A melhor imagem disponível do criativo.

    `thumbnail_url` é o último recurso: costuma vir em 64×64px e estica em
    borrão no cartão. As outras fontes trazem a capa real."""
    if not creative:
        return None
    story = creative.get("object_story_spec") or {}
    return (
        creative.get("image_url")
        or (story.get("video_data") or {}).get("image_url")
        or (story.get("link_data") or {}).get("picture")
        or creative.get("thumbnail_url")
        or None
    )


def _blank_ad(ad_id: str, name: str) -> dict:
    return {
        "id": ad_id,
        "name": name,
        "spend": 0.0,
        "impressions": 0,
        "clicks": 0,
        "leads": 0.0,
        "cpl": 0.0,
        "temMiniatura": False,
        "objectType": None,
        "clientes": 0,
        "cac": 0.0,
        "valorPorCliente": None,
        "fechamentoDias": None,
    }


def list_ads(date_range: DateRange) -> list[dict]:
    account = _ad_account_id()
    insights = meta_get(
        f"{account}/insights",
        {
            "level": "ad",
            "time_range": {"since": date_range.since, "until": date_range.until},
            "fields": "ad_id,ad_name,spend,impressions,clicks,actions",
            "limit": 100,
        },
    )
    listing = meta_get(
        f"{account}/ads",
        {"fields": f"name,status,effective_status,{_CREATIVE_FIELDS}", "limit": 100},
    )

    by_id: dict[str, dict] = {}

    for row in insights.get("data") or []:
        ad_id = str(row.get("ad_id") or "")
        if not ad_id:
            continue
        spend = float(row.get("spend") or 0)
        leads = leads_from_row(row)
        entry = _blank_ad(ad_id, str(row.get("ad_name") or ""))
        entry["spend"] = spend
        entry["impressions"] = int(float(row.get("impressions") or 0))
        entry["clicks"] = int(float(row.get("clicks") or 0))
        entry["leads"] = leads
        entry["cpl"] = (spend / leads) if leads else 0.0
        by_id[ad_id] = entry

    for ad in listing.get("data") or []:
        ad_id = ad["id"]
        entry = by_id.get(ad_id) or _blank_ad(ad_id, ad.get("name") or "")
        entry["status"] = ad.get("effective_status") or ad.get("status")
        # A URL do criativo não desce ao navegador (CSP bloqueia o CDN da
        # Meta) — a imagem vem por /api/traffic/thumbnail/.
        entry["temMiniatura"] = _best_image(ad.get("creative")) is not None
        entry["objectType"] = (ad.get("creative") or {}).get("object_type")
        by_id[ad_id] = entry

    _assign_sales(by_id)

    return sorted(by_id.values(), key=lambda a: (a["leads"], a["spend"]), reverse=True)


def _assign_sales(by_id: dict[str, dict]) -> None:
    """Cada grupo de vendas vai para um único anúncio — porte de atribuirVendas.

    A Meta tem várias `ad_id` com nomes quase iguais ("… 2026", "— Cópia").
    Sem esta escolha, clientes caem num anúncio desligado ou aparecem
    duplicados em todas as variações, e o total deixa de bater."""
    try:
        crossing = cross_sales()
    except Exception:  # noqa: BLE001 — sem cruzamento, segue sem dados de venda
        return

    accumulated: dict[str, dict] = {}

    def _better(current: dict | None, candidate: dict) -> bool:
        if current is None:
            return True
        if candidate["leads"] != current["leads"]:
            return candidate["leads"] > current["leads"]
        return candidate["spend"] > current["spend"]

    for sale_key, sale in crossing["porAnuncio"].items():
        exact: dict | None = None
        variant: dict | None = None
        for ad in by_id.values():
            meta_key = ad_key(ad["name"])
            if meta_key == sale_key:
                if _better(exact, ad):
                    exact = ad
            elif meta_key.startswith(sale_key) or sale_key.startswith(meta_key):
                if _better(variant, ad):
                    variant = ad

        chosen = exact if exact and (exact["leads"] > 0 or exact["spend"] > 0) else (variant or exact)
        if not chosen:
            continue

        chosen["clientes"] += sale["vendas"]
        acc = accumulated.setdefault(chosen["id"], {"faturamento": 0.0, "gasto": 0.0, "dias": []})
        acc["faturamento"] += sale["faturamento"]
        acc["gasto"] += sale["spend"]
        if sale["dias"] is not None:
            acc["dias"].append(sale["dias"])

    for ad in by_id.values():
        if not ad["clientes"]:
            continue
        acc = accumulated.get(ad["id"])
        if not acc:
            continue
        ad["cac"] = (acc["gasto"] or ad["spend"]) / ad["clientes"]
        ad["valorPorCliente"] = (acc["faturamento"] / ad["clientes"]) if acc["faturamento"] else None
        ad["fechamentoDias"] = round(sum(acc["dias"]) / len(acc["dias"])) if acc["dias"] else None


def thumbnail_url(ad_id: str) -> str | None:
    """URL da imagem do criativo, para a rota de proxy buscar."""
    response = meta_get(ad_id, {"fields": _CREATIVE_FIELDS})
    return _best_image(response.get("creative"))


def ad_preview(ad_id: str, ad_format: str) -> str:
    """A Meta só entrega a prévia do anúncio como um `<iframe>`."""
    response = meta_get(f"{ad_id}/previews", {"ad_format": ad_format})
    data = response.get("data") or [{}]
    return data[0].get("body") or ""


def list_campaigns(date_range: DateRange) -> list[dict]:
    response = meta_get(
        f"{_ad_account_id()}/insights",
        {
            "level": "campaign",
            "time_range": {"since": date_range.since, "until": date_range.until},
            "fields": "campaign_id,campaign_name,spend,actions",
            "limit": 100,
        },
    )
    items = []
    for row in response.get("data") or []:
        spend = float(row.get("spend") or 0)
        leads = leads_from_row(row)
        items.append(
            {
                "id": str(row.get("campaign_id") or ""),
                "name": str(row.get("campaign_name") or ""),
                "spend": spend,
                "leads": leads,
                "cpl": (spend / leads) if leads else 0.0,
            }
        )
    items.sort(key=lambda c: c["spend"], reverse=True)
    return items


def audience_profile(date_range: DateRange) -> dict:
    def _query(breakdown: str) -> list[dict]:
        response = meta_get(
            f"{_ad_account_id()}/insights",
            {
                "time_range": {"since": date_range.since, "until": date_range.until},
                "breakdowns": breakdown,
                "fields": "spend,actions",
                "limit": 200,
            },
        )
        by_segment: dict[str, dict] = {}
        for row in response.get("data") or []:
            key = str(row.get(breakdown, "?"))
            segment = by_segment.setdefault(key, {"key": key, "spend": 0.0, "leads": 0.0})
            segment["spend"] += float(row.get("spend") or 0)
            segment["leads"] += leads_from_row(row)
        return [
            {**segment, "cpl": (segment["spend"] / segment["leads"]) if segment["leads"] else 0.0}
            for segment in by_segment.values()
        ]

    def _by_leads(item: dict) -> tuple:
        return (item["leads"], item["spend"])

    gender = sorted(_query("gender"), key=_by_leads, reverse=True)
    # Faixa etária sai em ordem de idade, não de volume — reordenar por leads
    # embaralharia a leitura de uma pirâmide.
    age = sorted(_query("age"), key=lambda item: item["key"])
    device = sorted(_query("impression_device"), key=_by_leads, reverse=True)

    return {
        "range": _range_dict(date_range),
        "genero": gender,
        "idade": age,
        "dispositivo": device,
    }


FUNNEL_STAGE_ORDER = ["(sem etapa)", "Contactado", "Agendou Reunião", "Proposta", "Cliente", "Desqualificado"]

# Nomes de criativo que a T4E usa — filtra lixo de utm_content mal formado.
AD_NAME_PATTERN = re.compile(r"AD\d|GIF|IMG|CAIO|LÉO|KAIQUE|TARJA|CHOQUEI|TWITTER", re.IGNORECASE)


def funnel(date_range: DateRange) -> dict:
    sheet_url = getattr(settings, "TRAFFIC_SHEET_LEADS_URL", "")
    if not sheet_url:
        raise ValidationError("A planilha de leads não está configurada no servidor.")

    rows = [
        row
        for row in parse_csv(download_text(sheet_url))
        if (iso := iso_date(row.get("Data"))) is not None and date_range.since <= iso <= date_range.until
    ]

    with_email = with_phone = no_location = budgeting = customers = 0
    stages: dict[str, int] = {}
    by_state: dict[str, int] = {}
    by_ad: dict[str, int] = {}

    for row in rows:
        if "@" in (row.get("email") or ""):
            with_email += 1
        if len(re.sub(r"\D", "", row.get("phone") or "")) >= 8:
            with_phone += 1

        stage = (row.get("Estágio do Lead") or "").strip() or "(sem etapa)"
        stages[stage] = stages.get(stage, 0) + 1

        normalized = strip_accents(stage)
        if re.search(r"orc|proposta", normalized):
            budgeting += 1
        if re.search(r"cliente|vend|fechad|ganho", normalized):
            customers += 1

        state = state_for(row.get("cidade"), row.get("estado"))
        if state:
            by_state[state] = by_state.get(state, 0) + 1
        else:
            no_location += 1

        ad_name = (row.get("utm_content") or "").replace("+", " ")
        try:
            ad_name = unquote(ad_name)
        except Exception:  # noqa: BLE001
            pass
        ad_name = ad_name.strip()
        if ad_name and ad_name != "?" and AD_NAME_PATTERN.search(ad_name):
            by_ad[ad_name] = by_ad.get(ad_name, 0) + 1

    # As etapas conhecidas saem na ordem do funil; etapa nova digitada na
    # planilha entra depois, em vez de sumir.
    ordered_stages = [{"stage": name, "count": stages[name]} for name in FUNNEL_STAGE_ORDER if name in stages]
    for name, count in stages.items():
        if name not in FUNNEL_STAGE_ORDER:
            ordered_stages.append({"stage": name, "count": count})

    # ⚠️ "Estágio do Lead" está quase toda vazia na planilha — a contagem
    # acima seria enganosa. Quem manda é a conciliação de vendas fechadas, e
    # o CAC vem do gasto da conta inteira.
    cac_real = None
    try:
        crossing = cross_sales()
        if crossing["clientesViaAds"]:
            customers = crossing["clientesViaAds"]
            cac_real = crossing["gastoDaConta"] / crossing["clientesViaAds"]
    except Exception:  # noqa: BLE001 — sem cruzamento, funil segue sem CAC real
        pass

    return {
        "range": _range_dict(date_range),
        "total": len(rows),
        "orcando": budgeting,
        "clientes": customers,
        "cacReal": cac_real,
        "comContato": {"email": with_email, "telefone": with_phone},
        "stages": ordered_stages,
        "byUF": sorted(
            (
                {
                    "uf": uf,
                    "count": count,
                    "lon": STATE_CENTROID.get(uf, (0, 0))[0],
                    "lat": STATE_CENTROID.get(uf, (0, 0))[1],
                }
                for uf, count in by_state.items()
            ),
            key=lambda item: item["count"],
            reverse=True,
        ),
        "semLocal": no_location,
        "byAd": sorted(
            ({"name": name, "count": count} for name, count in by_ad.items()),
            key=lambda item: item["count"],
            reverse=True,
        )[:12],
    }
