"""Testes do parser de CSV e das normalizações — porte de planilhas.ts."""
from contexts.traffic.infrastructure import sheets


def test_parse_csv_basic():
    text = "Nome,Valor\nAna,10\nBia,20\n"
    rows = sheets.parse_csv(text)
    assert rows == [{"Nome": "Ana", "Valor": "10"}, {"Nome": "Bia", "Valor": "20"}]


def test_parse_csv_quoted_field_with_comma_and_escaped_quote():
    text = 'Nome,Nota\n"Silva, João","Disse ""oi"""\n'
    rows = sheets.parse_csv(text)
    assert rows == [{"Nome": "Silva, João", "Nota": 'Disse "oi"'}]


def test_parse_csv_quoted_field_with_newline():
    text = 'Nome,Nota\n"linha 1\nlinha 2",ok\n'
    rows = sheets.parse_csv(text)
    assert rows == [{"Nome": "linha 1\nlinha 2", "Nota": "ok"}]


def test_parse_csv_skips_rows_with_single_column():
    text = "Nome,Valor\nsó uma coluna\nAna,10\n"
    rows = sheets.parse_csv(text)
    assert rows == [{"Nome": "Ana", "Valor": "10"}]


def test_parse_csv_empty_text_returns_empty_list():
    assert sheets.parse_csv("") == []


def test_iso_date_converts_brazilian_format():
    assert sheets.iso_date("12/04/2026 - 12:56") == "2026-04-12"


def test_iso_date_returns_none_for_invalid_format():
    assert sheets.iso_date("2026-04-12") is None
    assert sheets.iso_date("") is None
    assert sheets.iso_date(None) is None


def test_iso_date_returns_none_for_non_digit_day_or_month():
    # Non-digit day should return None
    assert sheets.iso_date("AB/04/2026 - 12:56") is None
    # Non-digit month should return None
    assert sheets.iso_date("12/CD/2026 - 12:56") is None
    # Both non-digit should return None
    assert sheets.iso_date("AB/CD/2026 - 12:56") is None


def test_days_between_with_invalid_dates_returns_none_not_raises():
    # days_between should return None instead of raising ValueError
    assert sheets.days_between("AB/CD/2026 - 12:56", "05/01/2026 - 00:00") is None
    assert sheets.days_between("01/01/2026 - 00:00", "AB/CD/2026 - 12:56") is None


def test_iso_date_returns_none_for_out_of_range_calendar_date():
    # Dia/mês fora do calendário: dígitos válidos, mas não é uma data real.
    assert sheets.iso_date("45/13/2026 - 10:00") is None


def test_days_between_with_out_of_range_date_returns_none_not_raises():
    assert sheets.days_between("45/13/2026 - 10:00", "05/01/2026 - 00:00") is None


def test_strip_accents():
    assert sheets.strip_accents("São Paulo") == "sao paulo"


def test_ad_key_normalizes_url_encoding_and_accents():
    assert sheets.ad_key("Anúncio+de+Teste") == "anunciodeteste"


def test_ad_key_handles_invalid_percent_encoding():
    # "% " não é um par hexadecimal válido — `unquote` deixa o "%" literal, e
    # o filtro de não-alfanuméricos remove só o "%" e o espaço.
    assert sheets.ad_key("100% off") == "100off"


def test_is_customer_stage():
    assert sheets.is_customer_stage("Cliente Fechado") is True
    assert sheets.is_customer_stage("Contactado") is False


def test_parse_amount_brazilian_currency():
    assert sheets.parse_amount("R$ 1.234,50") == 1234.5
    assert sheets.parse_amount("") == 0.0
    assert sheets.parse_amount(None) == 0.0


def test_days_between():
    assert sheets.days_between("01/01/2026 - 00:00", "05/01/2026 - 00:00") == 4
    assert sheets.days_between(None, "05/01/2026 - 00:00") is None


def test_phone_keys_strips_country_code_and_returns_two_lengths():
    # "+55 11 98765-4321" → dígitos "5511987654321" → strip do "55" inicial
    # → "11987654321" (11 dígitos) → últimos 8 e 9.
    assert sheets.phone_keys("+55 11 98765-4321") == ["87654321", "987654321"]


def test_phone_keys_short_number_returns_empty():
    assert sheets.phone_keys("123") == []


def test_name_tokens_ignores_short_words_and_parentheses():
    assert sheets.name_tokens("Ana da Silva (lead antigo)") == {"ana", "silva"}
