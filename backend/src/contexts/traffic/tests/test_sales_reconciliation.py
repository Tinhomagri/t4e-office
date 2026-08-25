"""Testes da conciliação de vendas — porte de vendas.ts.

Sem tocar rede: `download_text` e `meta_get` são substituídos por fixtures.
"""
import pytest

from contexts.traffic.infrastructure import sales_reconciliation as sr

FECHADOS_CSV = (
    "Nome,Telefone,Valor,Data de Criacao,Data de Fechamento\n"
    "Ana Silva,(11) 98765-4321,\"R$ 1.000,00\",01/01/2026 - 10:00,05/01/2026 - 10:00\n"
    "Bruno Homonimo Sem Telefone,,\"R$ 500,00\",02/01/2026 - 10:00,10/01/2026 - 10:00\n"
    "Ninguem Aqui,(11) 90000-0000,\"R$ 300,00\",01/01/2026 - 10:00,02/01/2026 - 10:00\n"
)

HISTORICO_CSV = (
    "NOME,TELEFONE,ORIGEM,utm_medium = Anúncio\n"
    "Ana Silva,(11) 98765-4321,Instagram,Anuncio AD1 Teste\n"
    "Bruno Homonimo Sem Telefone,(21) 91111-1111,Facebook,Anuncio AD2 Outro\n"
)


@pytest.fixture(autouse=True)
def _reset_cache():
    sr.reset_cache_for_tests()
    yield
    sr.reset_cache_for_tests()


def test_calculate_sales_matches_by_phone_first(settings, monkeypatch):
    settings.TRAFFIC_SHEET_FECHADOS_URL = "http://fake/fechados.csv"
    settings.TRAFFIC_SHEET_HIST_URL = "http://fake/historico.csv"
    settings.META_AD_ACCOUNT_ID = "act_1"

    def _fake_download(url):
        return FECHADOS_CSV if "fechados" in url else HISTORICO_CSV

    monkeypatch.setattr(sr, "download_text", _fake_download)
    monkeypatch.setattr(sr, "meta_get", lambda *a, **k: {"data": []})

    result = sr.calculate_sales()

    assert result["vendas"] == 3
    assert result["total"] == 1800.0
    assert result["naoAchado"]["vendas"] == 1
    assert result["naoAchado"]["faturamento"] == 300.0


def test_calculate_sales_falls_back_to_name_matching(settings, monkeypatch):
    settings.TRAFFIC_SHEET_FECHADOS_URL = "http://fake/fechados.csv"
    settings.TRAFFIC_SHEET_HIST_URL = "http://fake/historico.csv"
    settings.META_AD_ACCOUNT_ID = "act_1"

    monkeypatch.setattr(
        sr, "download_text", lambda url: FECHADOS_CSV if "fechados" in url else HISTORICO_CSV
    )
    monkeypatch.setattr(sr, "meta_get", lambda *a, **k: {"data": []})

    result = sr.calculate_sales()

    matched_ads = {ad["name"]: ad for ad in result["anuncios"]}
    assert "Anuncio AD2 Outro" in matched_ads
    assert matched_ads["Anuncio AD2 Outro"]["viaNome"] == 1


def test_calculate_sales_attributes_spend_by_ad_key_prefix(settings, monkeypatch):
    settings.TRAFFIC_SHEET_FECHADOS_URL = "http://fake/fechados.csv"
    settings.TRAFFIC_SHEET_HIST_URL = "http://fake/historico.csv"
    settings.META_AD_ACCOUNT_ID = "act_1"

    monkeypatch.setattr(
        sr, "download_text", lambda url: FECHADOS_CSV if "fechados" in url else HISTORICO_CSV
    )
    monkeypatch.setattr(
        sr,
        "meta_get",
        lambda *a, **k: {
            "data": [{"ad_name": "Anuncio AD1 Teste — Cópia", "spend": "150.0"}]
        },
    )

    result = sr.calculate_sales()

    ad1 = next(a for a in result["anuncios"] if a["name"] == "Anuncio AD1 Teste")
    assert ad1["spend"] == 150.0
    assert ad1["roas"] == pytest.approx(1000.0 / 150.0)


def test_calculate_sales_ignores_meta_errors_and_leaves_roas_none(settings, monkeypatch):
    settings.TRAFFIC_SHEET_FECHADOS_URL = "http://fake/fechados.csv"
    settings.TRAFFIC_SHEET_HIST_URL = "http://fake/historico.csv"
    settings.META_AD_ACCOUNT_ID = "act_1"

    monkeypatch.setattr(
        sr, "download_text", lambda url: FECHADOS_CSV if "fechados" in url else HISTORICO_CSV
    )

    def _raise(*a, **k):
        raise sr.MetaError("falhou")

    monkeypatch.setattr(sr, "meta_get", _raise)

    result = sr.calculate_sales()

    ad1 = next(a for a in result["anuncios"] if a["name"] == "Anuncio AD1 Teste")
    assert ad1["spend"] == 0.0
    assert ad1["roas"] is None


def test_cross_sales_caches_result(settings, monkeypatch):
    settings.TRAFFIC_SHEET_FECHADOS_URL = "http://fake/fechados.csv"
    settings.TRAFFIC_SHEET_HIST_URL = "http://fake/historico.csv"
    settings.META_AD_ACCOUNT_ID = "act_1"

    calls = {"n": 0}

    def _fake_download(url):
        calls["n"] += 1
        return FECHADOS_CSV if "fechados" in url else HISTORICO_CSV

    monkeypatch.setattr(sr, "download_text", _fake_download)
    monkeypatch.setattr(sr, "meta_get", lambda *a, **k: {"data": []})

    first = sr.cross_sales()
    second = sr.cross_sales()

    assert first is second
    # Cada `calculate_sales` baixa as duas planilhas; se o cache funcionar, a
    # segunda chamada não baixa de novo.
    assert calls["n"] == 2
