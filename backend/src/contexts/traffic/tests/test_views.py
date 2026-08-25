"""Testes HTTP das views de traffic — funções soltas (não classes), mesmo
padrão do resto da suíte (evita bug de finalizer do pytest-django)."""
import pytest
from rest_framework.test import APIClient

from contexts.identity.infrastructure.django.models import UserModel
from contexts.traffic.infrastructure import reports
from contexts.traffic.infrastructure.meta_client import DateRange, MetaError


@pytest.fixture
def client(db):
    user = UserModel.objects.create_user(
        email="ads@t4e.com", password="x", full_name="Ads", is_active=True
    )
    api = APIClient()
    api.force_authenticate(user=user)
    return api


def test_report_unknown_relatorio_returns_400(client):
    resp = client.get("/api/traffic/report/inexistente/")
    assert resp.status_code == 400


def test_report_invalid_date_returns_400(client):
    resp = client.get("/api/traffic/report/geral/?since=01-01-2026")
    assert resp.status_code == 400


def test_report_geral_without_config_returns_400(client, settings):
    settings.META_TRAFFIC_ACCESS_TOKEN = ""
    resp = client.get("/api/traffic/report/geral/")
    assert resp.status_code == 400


def test_report_geral_returns_overview_payload(client, monkeypatch):
    monkeypatch.setattr(
        reports, "overview", lambda faixa: {"range": {"since": faixa.since, "until": faixa.until}, "spend": 10.0}
    )
    resp = client.get("/api/traffic/report/geral/?since=2026-01-01&until=2026-01-31")
    assert resp.status_code == 200
    assert resp.json()["spend"] == 10.0
    assert resp["Cache-Control"] == "private, no-store"


def test_report_vendas_ignores_since_until(client, monkeypatch):
    from contexts.traffic.interface.api import views

    monkeypatch.setattr(views, "calculate_sales", lambda: {"vendas": 3})
    resp = client.get("/api/traffic/report/vendas/?since=2020-01-01&until=2020-01-02")
    assert resp.status_code == 200
    assert resp.json()["vendas"] == 3


def test_thumbnail_invalid_ad_id_returns_400(client):
    resp = client.get("/api/traffic/thumbnail/?ad_id=abc")
    assert resp.status_code == 400


def test_thumbnail_not_found_when_no_creative_image(client, monkeypatch):
    monkeypatch.setattr(reports, "thumbnail_url", lambda ad_id: None)
    resp = client.get("/api/traffic/thumbnail/?ad_id=12345")
    assert resp.status_code == 404


def test_preview_invalid_format_returns_400(client):
    resp = client.get("/api/traffic/preview/?ad_id=12345&formato=NADA")
    assert resp.status_code == 400


def test_preview_returns_html(client, monkeypatch):
    monkeypatch.setattr(reports, "ad_preview", lambda ad_id, fmt: "<iframe></iframe>")
    resp = client.get("/api/traffic/preview/?ad_id=12345")
    assert resp.status_code == 200
    assert resp.json()["html"] == "<iframe></iframe>"


def test_report_meta_error_returns_user_message_not_raw_exception(client, monkeypatch):
    def _raise(faixa):
        raise MetaError("technical: code 190", "O token da Meta expirou ou foi revogado.")

    monkeypatch.setattr(reports, "overview", _raise)
    resp = client.get("/api/traffic/report/geral/")
    assert resp.status_code == 502
    assert resp.json()["error"] == "O token da Meta expirou ou foi revogado."


def test_unauthenticated_request_is_rejected():
    resp = APIClient().get("/api/traffic/report/geral/")
    assert resp.status_code == 401
