"""Views HTTP do contexto traffic — /api/traffic/.

Painel de investimento em anúncios (Meta Marketing API) + conciliação de
vendas com planilhas do Google Sheets. Config global por variável de
ambiente (sem workspace nesta fase).
"""
from __future__ import annotations

import re

import httpx
from django.http import HttpResponse
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle
from rest_framework.views import APIView

from contexts.traffic.infrastructure import reports
from contexts.traffic.infrastructure.meta_client import DateRange, date_range
from contexts.traffic.infrastructure.sales_reconciliation import calculate_sales
from shared.domain.errors import NotFoundError, UpstreamError, ValidationError

REPORTS = ("geral", "serie", "anuncios", "campanhas", "publico", "funil", "vendas")
_ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
AD_ID_RE = re.compile(r"^\d{5,25}$")
AD_PREVIEW_FORMATS = {
    "MOBILE_FEED_STANDARD",
    "DESKTOP_FEED_STANDARD",
    "INSTAGRAM_STANDARD",
    "INSTAGRAM_STORY",
    "INSTAGRAM_REELS",
    "FACEBOOK_STORY_MOBILE",
}


class TrafficReportThrottle(UserRateThrottle):
    scope = "traffic_report"


class TrafficThumbnailThrottle(UserRateThrottle):
    scope = "traffic_thumbnail"


class TrafficPreviewThrottle(UserRateThrottle):
    scope = "traffic_preview"


def _date_params(request: Request) -> tuple[str | None, str | None]:
    since = request.query_params.get("since")
    until = request.query_params.get("until")
    for value in (since, until):
        if value and not _ISO_DATE.match(value):
            raise ValidationError("Use o formato AAAA-MM-DD.")
    return since, until


class TrafficReportView(APIView):
    """GET /api/traffic/report/<relatorio>/?since=&until=

    Sete relatórios de leitura, mesma casca de validação/erro pra todos —
    porte da rota única `[relatorio]` do T4E OS.
    """

    permission_classes = [IsAuthenticated]
    throttle_classes = [TrafficReportThrottle]

    def get(self, request: Request, relatorio: str) -> Response:
        if relatorio not in REPORTS:
            raise ValidationError("Relatório desconhecido.")

        since, until = _date_params(request)
        faixa = date_range(since, until)
        payload = self._build(relatorio, faixa)
        response = Response(payload)
        response["Cache-Control"] = "private, no-store"
        return response

    def _build(self, relatorio: str, faixa: DateRange) -> dict:
        range_dict = {"since": faixa.since, "until": faixa.until}
        if relatorio == "geral":
            return reports.overview(faixa)
        if relatorio == "serie":
            return {"range": range_dict, "data": reports.daily_series(faixa)}
        if relatorio == "anuncios":
            return {"range": range_dict, "data": reports.list_ads(faixa)}
        if relatorio == "campanhas":
            return {"range": range_dict, "data": reports.list_campaigns(faixa)}
        if relatorio == "publico":
            return reports.audience_profile(faixa)
        if relatorio == "funil":
            return reports.funnel(faixa)
        # "vendas" ignora o período de propósito — a venda fecha 1-2 meses
        # depois do lead, recortar atribuiria faturamento a gasto que não gerou.
        return calculate_sales()


class TrafficThumbnailView(APIView):
    """GET /api/traffic/thumbnail/?ad_id=

    Proxy da miniatura do criativo — a CSP só libera img-src 'self', e a URL
    da Meta carrega parâmetros de sessão que não podem chegar ao navegador.
    """

    permission_classes = [IsAuthenticated]
    throttle_classes = [TrafficThumbnailThrottle]

    def get(self, request: Request) -> HttpResponse:
        ad_id = request.query_params.get("ad_id") or ""
        if not AD_ID_RE.match(ad_id):
            raise ValidationError("Identificador de anúncio inválido.")

        url = reports.thumbnail_url(ad_id)
        if not url:
            raise NotFoundError("Este anúncio não tem miniatura.")

        try:
            image = httpx.get(url, timeout=30)
        except httpx.HTTPError as exc:
            raise UpstreamError(f"Falha ao buscar a miniatura: {exc}") from exc

        content_type = image.headers.get("content-type", "")
        if image.status_code != 200 or not content_type.startswith("image/"):
            raise NotFoundError("A Meta não devolveu a imagem.")

        response = HttpResponse(image.content, content_type=content_type)
        # O criativo de um anúncio não muda; uma hora de cache tira dezenas
        # de idas à Meta a cada visita à tela.
        response["Cache-Control"] = "private, max-age=3600"
        return response


class TrafficPreviewView(APIView):
    """GET /api/traffic/preview/?ad_id=&formato=

    A Meta só devolve a prévia como HTML com <iframe> pro facebook.com."""

    permission_classes = [IsAuthenticated]
    throttle_classes = [TrafficPreviewThrottle]

    def get(self, request: Request) -> Response:
        ad_id = request.query_params.get("ad_id") or ""
        if not AD_ID_RE.match(ad_id):
            raise ValidationError("Identificador de anúncio inválido.")

        ad_format = request.query_params.get("formato") or "MOBILE_FEED_STANDARD"
        if ad_format not in AD_PREVIEW_FORMATS:
            raise ValidationError("Formato de prévia desconhecido.")

        html = reports.ad_preview(ad_id, ad_format)
        if not html:
            raise NotFoundError("A Meta não devolveu prévia para este anúncio.")
        return Response({"html": html})
