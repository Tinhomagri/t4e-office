"""Testes dos relatórios — porte de relatorios.ts. Rede sempre mockada."""
import pytest

from contexts.traffic.infrastructure import reports
from contexts.traffic.infrastructure.meta_client import DateRange
from shared.domain.errors import ValidationError

RANGE = DateRange(since="2026-01-01", until="2026-01-31")


def test_overview_computes_cpl(monkeypatch):
    monkeypatch.setattr(
        reports,
        "meta_get",
        lambda *a, **k: {
            "data": [
                {
                    "spend": "100.0",
                    "impressions": "1000",
                    "clicks": "50",
                    "ctr": "5.0",
                    "cpc": "2.0",
                    "actions": [{"action_type": "lead", "value": "10"}],
                }
            ]
        },
    )
    result = reports.overview(RANGE)
    assert result["spend"] == 100.0
    assert result["leads"] == 10.0
    assert result["cpl"] == 10.0


def test_overview_zero_leads_gives_zero_cpl(monkeypatch):
    monkeypatch.setattr(reports, "meta_get", lambda *a, **k: {"data": [{"spend": "50.0"}]})
    result = reports.overview(RANGE)
    assert result["leads"] == 0.0
    assert result["cpl"] == 0.0


def test_daily_series_maps_each_row(monkeypatch):
    monkeypatch.setattr(
        reports,
        "meta_get",
        lambda *a, **k: {
            "data": [
                {"date_start": "2026-01-01", "spend": "10", "actions": [{"action_type": "lead", "value": "1"}]},
                {"date_start": "2026-01-02", "spend": "20", "actions": []},
            ]
        },
    )
    result = reports.daily_series(RANGE)
    assert result == [
        {"date": "2026-01-01", "spend": 10.0, "leads": 1.0},
        {"date": "2026-01-02", "spend": 20.0, "leads": 0.0},
    ]


def test_list_ads_merges_insights_and_ad_listing(monkeypatch):
    def _fake_get(edge, params=None):
        if edge.endswith("/insights"):
            return {
                "data": [
                    {"ad_id": "1", "ad_name": "Anuncio A", "spend": "30", "impressions": "300", "clicks": "3", "actions": []}
                ]
            }
        return {
            "data": [
                {
                    "id": "1",
                    "name": "Anuncio A",
                    "effective_status": "ACTIVE",
                    "creative": {"image_url": "https://example.com/img.jpg"},
                },
                {"id": "2", "name": "Anuncio B (sem insight)", "effective_status": "PAUSED", "creative": {}},
            ]
        }

    monkeypatch.setattr(reports, "meta_get", _fake_get)
    monkeypatch.setattr(reports, "cross_sales", lambda: (_ for _ in ()).throw(RuntimeError("sem planilha")))

    result = reports.list_ads(RANGE)

    by_id = {ad["id"]: ad for ad in result}
    assert by_id["1"]["spend"] == 30.0
    assert by_id["1"]["temMiniatura"] is True
    assert by_id["2"]["spend"] == 0.0
    assert by_id["2"]["temMiniatura"] is False


def test_list_ads_assigns_sales_to_the_best_matching_ad(monkeypatch):
    def _fake_get(edge, params=None):
        if edge.endswith("/insights"):
            return {
                "data": [
                    {"ad_id": "1", "ad_name": "Campanha X", "spend": "10", "impressions": "10", "clicks": "1", "actions": []},
                    {"ad_id": "2", "ad_name": "Campanha X — Cópia", "spend": "5", "impressions": "5", "clicks": "1", "actions": []},
                ]
            }
        return {
            "data": [
                {"id": "1", "name": "Campanha X", "creative": {}},
                {"id": "2", "name": "Campanha X — Cópia", "creative": {}},
            ]
        }

    monkeypatch.setattr(reports, "meta_get", _fake_get)
    monkeypatch.setattr(
        reports,
        "cross_sales",
        lambda: {
            "porAnuncio": {"campanhax": {"vendas": 2, "faturamento": 2000.0, "spend": 15.0, "dias": 5}},
            "clientesViaAds": 2,
            "faturamentoAds": 2000.0,
            "gastoDaConta": 15.0,
            "totalDeClientes": 2,
        },
    )

    result = reports.list_ads(RANGE)
    winner = next(ad for ad in result if ad["id"] == "1")
    assert winner["clientes"] == 2
    assert winner["valorPorCliente"] == 1000.0


def test_list_ads_falls_back_to_variant_when_exact_match_is_inactive(monkeypatch):
    def _fake_get(edge, params=None):
        if edge.endswith("/insights"):
            return {
                "data": [
                    # A ad_id do nome exato está zerada — pausada/desligada.
                    {"ad_id": "1", "ad_name": "Campanha X", "spend": "0", "impressions": "0", "clicks": "0", "actions": []},
                    {"ad_id": "2", "ad_name": "Campanha X — Cópia", "spend": "5", "impressions": "5", "clicks": "1", "actions": [{"action_type": "lead", "value": "2"}]},
                ]
            }
        return {
            "data": [
                {"id": "1", "name": "Campanha X", "creative": {}},
                {"id": "2", "name": "Campanha X — Cópia", "creative": {}},
            ]
        }

    monkeypatch.setattr(reports, "meta_get", _fake_get)
    monkeypatch.setattr(
        reports,
        "cross_sales",
        lambda: {
            "porAnuncio": {"campanhax": {"vendas": 3, "faturamento": 3000.0, "spend": 15.0, "dias": 5}},
            "clientesViaAds": 3,
            "faturamentoAds": 3000.0,
            "gastoDaConta": 15.0,
            "totalDeClientes": 3,
        },
    )

    result = reports.list_ads(RANGE)
    by_id = {ad["id"]: ad for ad in result}

    assert by_id["2"]["clientes"] == 3
    assert by_id["2"]["valorPorCliente"] == 1000.0
    assert by_id["1"]["clientes"] == 0


def test_list_ads_variant_tie_break_prefers_higher_leads(monkeypatch):
    def _fake_get(edge, params=None):
        if edge.endswith("/insights"):
            return {
                "data": [
                    # Nome exato inativo — força a escolha entre as duas variantes.
                    {"ad_id": "1", "ad_name": "Campanha X", "spend": "0", "impressions": "0", "clicks": "0", "actions": []},
                    {"ad_id": "2", "ad_name": "Campanha X A", "spend": "10", "impressions": "10", "clicks": "1", "actions": [{"action_type": "lead", "value": "1"}]},
                    {"ad_id": "3", "ad_name": "Campanha X B", "spend": "5", "impressions": "5", "clicks": "1", "actions": [{"action_type": "lead", "value": "2"}]},
                ]
            }
        return {
            "data": [
                {"id": "1", "name": "Campanha X", "creative": {}},
                {"id": "2", "name": "Campanha X A", "creative": {}},
                {"id": "3", "name": "Campanha X B", "creative": {}},
            ]
        }

    monkeypatch.setattr(reports, "meta_get", _fake_get)
    monkeypatch.setattr(
        reports,
        "cross_sales",
        lambda: {
            "porAnuncio": {"campanhax": {"vendas": 1, "faturamento": 500.0, "spend": 15.0, "dias": 5}},
            "clientesViaAds": 1,
            "faturamentoAds": 500.0,
            "gastoDaConta": 15.0,
            "totalDeClientes": 1,
        },
    )

    result = reports.list_ads(RANGE)
    by_id = {ad["id"]: ad for ad in result}

    # ad "3" tem mais leads (2 > 1) que ad "2" — deve ganhar mesmo com menos spend.
    assert by_id["3"]["clientes"] == 1
    assert by_id["2"]["clientes"] == 0
    assert by_id["1"]["clientes"] == 0


def test_thumbnail_url_extracts_best_image(monkeypatch):
    monkeypatch.setattr(
        reports,
        "meta_get",
        lambda edge, params=None: {"creative": {"image_url": "https://example.com/img.jpg"}},
    )
    assert reports.thumbnail_url("123") == "https://example.com/img.jpg"


def test_thumbnail_url_returns_none_without_creative(monkeypatch):
    monkeypatch.setattr(reports, "meta_get", lambda edge, params=None: {})
    assert reports.thumbnail_url("123") is None


def test_ad_preview_returns_body(monkeypatch):
    monkeypatch.setattr(
        reports,
        "meta_get",
        lambda edge, params=None: {"data": [{"body": "<iframe>preview</iframe>"}]},
    )
    assert reports.ad_preview("123", "DESKTOP_FEED_STANDARD") == "<iframe>preview</iframe>"


def test_ad_preview_returns_empty_string_when_no_data(monkeypatch):
    monkeypatch.setattr(reports, "meta_get", lambda edge, params=None: {"data": []})
    assert reports.ad_preview("123", "DESKTOP_FEED_STANDARD") == ""


def test_list_campaigns_sorted_by_spend_desc(monkeypatch):
    monkeypatch.setattr(
        reports,
        "meta_get",
        lambda *a, **k: {
            "data": [
                {"campaign_id": "1", "campaign_name": "Baixo", "spend": "10", "actions": []},
                {"campaign_id": "2", "campaign_name": "Alto", "spend": "100", "actions": []},
            ]
        },
    )
    result = reports.list_campaigns(RANGE)
    assert [c["name"] for c in result] == ["Alto", "Baixo"]


def test_audience_profile_sorts_age_by_key_not_leads(monkeypatch):
    monkeypatch.setattr(
        reports,
        "meta_get",
        lambda edge, params=None: {
            "data": [
                {"age": "35-44", "spend": "10", "actions": [{"action_type": "lead", "value": "5"}]},
                {"age": "18-24", "spend": "10", "actions": [{"action_type": "lead", "value": "1"}]},
            ]
        }
        if params and params.get("breakdowns") == "age"
        else {"data": []},
    )
    result = reports.audience_profile(RANGE)
    assert [item["key"] for item in result["idade"]] == ["18-24", "35-44"]


def test_funnel_raises_validation_error_without_sheet_configured(settings):
    settings.TRAFFIC_SHEET_LEADS_URL = ""
    with pytest.raises(ValidationError):
        reports.funnel(RANGE)


def test_funnel_counts_stages_states_and_ads(settings, monkeypatch):
    settings.TRAFFIC_SHEET_LEADS_URL = "http://fake/leads.csv"
    csv_text = (
        "Data,email,phone,Estágio do Lead,cidade,estado,utm_content\n"
        "15/01/2026 - 10:00,ana@x.com,11999999999,Contactado,São Paulo,,AD1+Teste\n"
        "16/01/2026 - 10:00,,,,,,lixo+sem+padrao\n"
    )
    monkeypatch.setattr(reports, "download_text", lambda url: csv_text)
    monkeypatch.setattr(reports, "cross_sales", lambda: (_ for _ in ()).throw(RuntimeError("sem planilha de vendas")))

    result = reports.funnel(RANGE)

    assert result["total"] == 2
    assert result["comContato"]["email"] == 1
    assert result["comContato"]["telefone"] == 1
    assert {"uf": "SP", "count": 1, "lon": -48.6, "lat": -22.2} in result["byUF"]
    assert result["semLocal"] == 1
    assert result["byAd"] == [{"name": "AD1 Teste", "count": 1}]
