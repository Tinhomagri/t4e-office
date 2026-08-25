"""Testes do cliente da Graph API — sem tocar a rede de verdade."""
import httpx
import pytest

from contexts.traffic.infrastructure import meta_client
from shared.domain.errors import ValidationError


def test_date_range_defaults_to_last_30_days():
    result = meta_client.date_range()
    from datetime import date
    since = date.fromisoformat(result.since)
    until = date.fromisoformat(result.until)
    assert (until - since).days == 29


def test_date_range_uses_given_values():
    result = meta_client.date_range("2026-01-01", "2026-01-31")
    assert result.since == "2026-01-01"
    assert result.until == "2026-01-31"


def test_meta_get_without_token_raises_validation_error(settings):
    settings.META_TRAFFIC_ACCESS_TOKEN = ""
    with pytest.raises(ValidationError):
        meta_client.meta_get("act_1/insights")


def test_meta_get_raises_meta_error_on_api_error(settings, monkeypatch):
    settings.META_TRAFFIC_ACCESS_TOKEN = "tok"
    settings.META_AD_ACCOUNT_ID = "act_1"

    class _FakeResponse:
        def json(self):
            return {"error": {"message": "token expirado", "code": 190}}

    monkeypatch.setattr(httpx, "get", lambda *a, **k: _FakeResponse())

    with pytest.raises(meta_client.MetaError) as exc:
        meta_client.meta_get("act_1/insights")
    assert "token da Meta expirou" in exc.value.user_message


def test_leads_from_row_prefers_first_matching_action_type():
    row = {
        "actions": [
            {"action_type": "onsite_conversion.lead_grouped", "value": "5"},
            {"action_type": "lead", "value": "3"},
        ]
    }
    assert meta_client.leads_from_row(row) == 3.0


def test_leads_from_row_falls_back_to_second_action_type():
    row = {"actions": [{"action_type": "onsite_conversion.lead_grouped", "value": "5"}]}
    assert meta_client.leads_from_row(row) == 5.0


def test_leads_from_row_returns_zero_without_actions():
    assert meta_client.leads_from_row({}) == 0.0
