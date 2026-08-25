# Marketing / Tráfego — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the T4E OS "Tráfego" module (Meta Ads investment panel + sales
reconciliation) into t4e-office's `marketing` feature, functional end to end,
without touching the existing Postagem (`contexts.integrations`) code.

**Architecture:** New Django context `contexts/traffic/` mirrors
`contexts/integrations`'s structure (infrastructure + interface/api). Five
read endpoints hit the Meta Marketing Graph API directly; two (funnel, sales)
additionally cross-reference CSV exports of Google Sheets, ported line-for-line
from the T4E OS TypeScript. A new frontend page `TrafficPage.tsx` under
`features/marketing/` consumes it via one API client file, reusing the
existing `command-center` UI kit.

**Tech Stack:** Django + DRF + httpx (backend, existing deps), React + TanStack
Query + recharts (frontend, existing deps). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-25-marketing-trafego-design.md`

## Global Constraints

- Do not modify `contexts.integrations`, `contexts.sales`, or any existing
  Postagem/CRM code — this is a pure addition.
- Config is env-var only (no per-workspace credential UI in this phase):
  `META_TRAFFIC_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID`, `META_GRAPH_VERSION`
  (default `v21.0`), `TRAFFIC_SHEET_LEADS_URL`, `TRAFFIC_SHEET_HIST_URL`,
  `TRAFFIC_SHEET_FECHADOS_URL`.
- Missing token/account id → the request raises `ValidationError` (400), not
  a 500 — the frontend must show a config warning, never a broken page.
- `vendas` (sales reconciliation) ignores the `since`/`until` filter on
  purpose: a sale closes 1–2 months after the lead, so scoping by the
  screen's period would attribute revenue to spend that didn't generate it.
- All comments and docstrings in the new backend/frontend code: Portuguese,
  matching the rest of the codebase. Identifiers: English, also matching the
  rest of the codebase (e.g. `Lead`, `ScheduledPostModel`) — this differs
  from the T4E OS source's Portuguese identifiers, translated faithfully.
- Every new endpoint requires `IsAuthenticated` (no anonymous access — unlike
  T4E OS, which had its own login system for the whole app).

---

### Task 1: Traffic context skeleton + Meta Graph API client

**Files:**
- Create: `backend/src/contexts/traffic/__init__.py`
- Create: `backend/src/contexts/traffic/apps.py`
- Create: `backend/src/contexts/traffic/infrastructure/__init__.py`
- Create: `backend/src/contexts/traffic/infrastructure/meta_client.py`
- Create: `backend/src/contexts/traffic/tests/__init__.py`
- Test: `backend/src/contexts/traffic/tests/test_meta_client.py`
- Modify: `backend/src/config/settings/base.py`

**Interfaces:**
- Produces: `MetaError(UpstreamError)` with `.user_message: str`; `DateRange`
  (`@dataclass(frozen=True)`, fields `since: str`, `until: str`);
  `date_range(since: str | None, until: str | None) -> DateRange`;
  `meta_get(edge: str, params: dict | None = None) -> dict`;
  `action_value(actions: list[dict] | None, action_type: str) -> float`;
  `leads_from_row(row: dict) -> float`. Tasks 4 and 5 import all of these
  from `contexts.traffic.infrastructure.meta_client`.

- [ ] **Step 1: Create the context package files**

`backend/src/contexts/traffic/__init__.py` (empty file).

`backend/src/contexts/traffic/apps.py`:

```python
"""Configuração do app traffic."""
from django.apps import AppConfig


class TrafficConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "contexts.traffic"
    label = "traffic"
    verbose_name = "Tráfego pago (Meta Ads)"
```

`backend/src/contexts/traffic/infrastructure/__init__.py` (empty file).

`backend/src/contexts/traffic/tests/__init__.py` (empty file).

- [ ] **Step 2: Register the app and add config env vars**

Modify `backend/src/config/settings/base.py`. Add `"contexts.traffic",` to
the `INSTALLED_APPS` list, right after `"contexts.integrations",`:

```python
    "contexts.integrations",
    "contexts.traffic",
    "contexts.sales",
```

Then, right after the `AUTH_AUTO_ACTIVATE = env.bool(...)` line, add:

```python
# Tráfego pago (Meta Ads) — config global por variável de ambiente, sem
# credencial por workspace nesta fase. Sem token/conta, os endpoints
# devolvem ValidationError (400) em vez de tentar falar com a Meta.
META_TRAFFIC_ACCESS_TOKEN = env("META_TRAFFIC_ACCESS_TOKEN", default="")
META_AD_ACCOUNT_ID = env("META_AD_ACCOUNT_ID", default="")
META_GRAPH_VERSION = env("META_GRAPH_VERSION", default="v21.0")
# Planilha de leads (funil): etapa, cidade/UF, utm_content.
TRAFFIC_SHEET_LEADS_URL = env("TRAFFIC_SHEET_LEADS_URL", default="")
# Planilha histórica de leads (telefone, nome, origem, anúncio) — só para a
# conciliação de vendas casar por telefone/nome.
TRAFFIC_SHEET_HIST_URL = env("TRAFFIC_SHEET_HIST_URL", default="")
# Planilha de vendas fechadas (nome, telefone, valor, datas).
TRAFFIC_SHEET_FECHADOS_URL = env("TRAFFIC_SHEET_FECHADOS_URL", default="")
```

And inside `REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]`, add three scopes next
to the existing `"public_card_create": "20/hour"`:

```python
    "DEFAULT_THROTTLE_RATES": {
        "public_card_create": "20/hour",
        "traffic_report": "90/min",
        "traffic_thumbnail": "400/min",
        "traffic_preview": "60/min",
    },
```

- [ ] **Step 3: Write `meta_client.py`**

`backend/src/contexts/traffic/infrastructure/meta_client.py`:

```python
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
```

- [ ] **Step 4: Write the failing test**

`backend/src/contexts/traffic/tests/test_meta_client.py`:

```python
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
```

- [ ] **Step 5: Run the tests to verify they fail (module doesn't exist yet before Step 3, but run now to confirm the full file works)**

Run: `cd backend && .venv/bin/pytest src/contexts/traffic/tests/test_meta_client.py -v`
Expected: PASS (Step 3 already implemented `meta_client.py`; this run is the
verification pass, not a red/green cycle — the module is small enough to
write and test in the same step).

- [ ] **Step 6: Commit**

```bash
git add backend/src/contexts/traffic/__init__.py \
        backend/src/contexts/traffic/apps.py \
        backend/src/contexts/traffic/infrastructure/__init__.py \
        backend/src/contexts/traffic/infrastructure/meta_client.py \
        backend/src/contexts/traffic/tests/__init__.py \
        backend/src/contexts/traffic/tests/test_meta_client.py \
        backend/src/config/settings/base.py
git commit -m "feat(traffic): cliente da Graph API da Meta + config do módulo"
```

---

### Task 2: CSV/planilha utilities (`sheets.py`)

**Files:**
- Create: `backend/src/contexts/traffic/infrastructure/sheets.py`
- Test: `backend/src/contexts/traffic/tests/test_sheets.py`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `download_text(url: str) -> str`; `CsvRow = dict[str, str]`;
  `parse_csv(text: str) -> list[CsvRow]`; `iso_date(raw: str | None) -> str | None`;
  `strip_accents(text: str | None) -> str`; `ad_key(raw: str | None) -> str`;
  `is_customer_stage(stage: str | None) -> bool`;
  `parse_amount(raw: str | None) -> float`;
  `days_between(start: str | None, end: str | None) -> int | None`;
  `phone_keys(raw: str | None) -> list[str]`;
  `name_tokens(raw: str | None) -> set[str]`. Tasks 4 and 5 import all of
  these from `contexts.traffic.infrastructure.sheets`.

- [ ] **Step 1: Write `sheets.py`**

`backend/src/contexts/traffic/infrastructure/sheets.py`:

```python
"""Leitura das planilhas do Google publicadas como CSV — porte de
planilhas.ts do T4E OS.

⚠️ Privacidade: essas planilhas estão publicadas como CSV público, então
qualquer um com o link lê os contatos dos leads. Trocar por Service Account
do Google é a saída futura, e não muda nada aqui além da forma de buscar.
"""
from __future__ import annotations

import re
import unicodedata
from datetime import date
from urllib.parse import unquote

import httpx

CsvRow = dict[str, str]


def download_text(url: str) -> str:
    if not url:
        return ""
    try:
        resp = httpx.get(url, timeout=30, follow_redirects=True)
        resp.raise_for_status()
        return resp.text
    except httpx.HTTPError:
        return ""


def parse_csv(text: str) -> list[CsvRow]:
    """CSV com aspas, aspas escapadas e quebra de linha dentro do campo."""
    rows: list[list[str]] = []
    row: list[str] = []
    field = ""
    in_quotes = False

    i = 0
    n = len(text)
    while i < n:
        c = text[i]
        if in_quotes:
            if c == '"' and i + 1 < n and text[i + 1] == '"':
                field += '"'
                i += 1
            elif c == '"':
                in_quotes = False
            else:
                field += c
        elif c == '"':
            in_quotes = True
        elif c == ",":
            row.append(field)
            field = ""
        elif c == "\n":
            row.append(field)
            rows.append(row)
            row = []
            field = ""
        elif c != "\r":
            field += c
        i += 1
    if field or row:
        row.append(field)
        rows.append(row)

    if not rows:
        return []
    header = [title.strip() for title in rows.pop(0)]
    result: list[CsvRow] = []
    for cols in rows:
        if len(cols) <= 1:
            continue
        record: CsvRow = {}
        for index, title in enumerate(header):
            record[title] = (cols[index] if index < len(cols) else "").strip()
        result.append(record)
    return result


def iso_date(raw: str | None) -> str | None:
    """`12/04/2026 - 12:56` → `2026-04-12`."""
    text = (raw or "").strip()
    if len(text) < 10 or text[2] != "/" or text[5] != "/":
        return None
    year = text[6:10]
    if not re.fullmatch(r"\d{4}", year):
        return None
    return f"{year}-{text[3:5]}-{text[0:2]}"


def strip_accents(text: str | None) -> str:
    normalized = unicodedata.normalize("NFD", (text or "").lower())
    return "".join(c for c in normalized if unicodedata.category(c) != "Mn")


def ad_key(raw: str | None) -> str:
    """Chave normalizada de um anúncio: só letras e números, sem acento.

    O `utm_content` chega codificado em URL e com `+` no lugar do espaço, e o
    mesmo criativo aparece na Meta com sufixos ("… 2026", "— Cópia"). Reduzir
    os dois lados a esta chave é o que permite casar planilha com Gerenciador.
    """
    text = (raw or "").replace("+", " ")
    try:
        text = unquote(text)
    except Exception:  # noqa: BLE001 — nome com `%` solto não é URL válida
        pass
    return re.sub(r"[^a-z0-9]", "", strip_accents(text))


def is_customer_stage(stage: str | None) -> bool:
    return bool(re.search(r"cliente|vend|fechad|ganho", strip_accents(stage)))


def parse_amount(raw: str | None) -> float:
    """`R$ 1.234,50` → `1234.5`."""
    cleaned = re.sub(r"[^\d,.\-]", "", raw or "")
    cleaned = cleaned.replace(".", "").replace(",", ".")
    try:
        return float(cleaned)
    except ValueError:
        return 0.0


def days_between(start: str | None, end: str | None) -> int | None:
    a = iso_date(start)
    b = iso_date(end)
    if not a or not b:
        return None
    delta = date.fromisoformat(b) - date.fromisoformat(a)
    return max(0, delta.days)


def phone_keys(raw: str | None) -> list[str]:
    """Últimos 8 e 9 dígitos, sem o 55 do país — é assim que os cadastros casam."""
    digits = re.sub(r"\D", "", raw or "")
    if digits.startswith("55"):
        digits = digits[2:]
    keys: list[str] = []
    if len(digits) >= 8:
        keys.append(digits[-8:])
    if len(digits) >= 9:
        keys.append(digits[-9:])
    return keys


def name_tokens(raw: str | None) -> set[str]:
    """Palavras com mais de duas letras do nome, para o casamento por nome."""
    base = strip_accents((raw or "").split("(")[0])
    base = re.sub(r"[^a-z ]", " ", base)
    return {token for token in base.split() if len(token) > 2}
```

- [ ] **Step 2: Write the tests**

`backend/src/contexts/traffic/tests/test_sheets.py`:

```python
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
```

- [ ] **Step 3: Run the tests**

Run: `cd backend && .venv/bin/pytest src/contexts/traffic/tests/test_sheets.py -v`
Expected: PASS (all tests in the file)

- [ ] **Step 4: Commit**

```bash
git add backend/src/contexts/traffic/infrastructure/sheets.py \
        backend/src/contexts/traffic/tests/test_sheets.py
git commit -m "feat(traffic): parser de CSV e normalizações de planilha"
```

---

### Task 3: Geography module (`geography.py`)

**Files:**
- Create: `backend/src/contexts/traffic/infrastructure/geography.py`
- Test: `backend/src/contexts/traffic/tests/test_geography.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `STATES: list[str]`; `STATE_CENTROID: dict[str, tuple[float, float]]`;
  `state_for(city: str | None, state: str | None) -> str | None`. Task 5
  imports `STATE_CENTROID` and `state_for` from
  `contexts.traffic.infrastructure.geography`.

- [ ] **Step 1: Write `geography.py`**

`backend/src/contexts/traffic/infrastructure/geography.py`:

```python
"""Geografia dos leads — porte de geografia.ts do T4E OS.

A planilha é preenchida por pessoas, então "São Paulo", "sao paulo" e
"guaratinguetasp" convivem. As regras abaixo, em ordem, resolvem quase tudo;
o resto vira "sem local" — informação honesta, não erro a esconder.
"""
from __future__ import annotations

import re
import unicodedata

STATES = [
    "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS",
    "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC",
    "SP", "SE", "TO",
]

# Centroides aproximados (longitude, latitude), pra posicionar o rótulo no mapa.
STATE_CENTROID: dict[str, tuple[float, float]] = {
    "AC": (-70.5, -9.0), "AL": (-36.6, -9.6), "AP": (-51.8, 1.4), "AM": (-64.6, -4.1),
    "BA": (-41.7, -12.5), "CE": (-39.6, -5.2), "DF": (-47.9, -15.8), "ES": (-40.3, -19.6),
    "GO": (-49.6, -16.0), "MA": (-45.3, -5.4), "MT": (-55.9, -13.7), "MS": (-54.6, -20.5),
    "MG": (-44.6, -18.5), "PA": (-52.3, -4.0), "PB": (-36.8, -7.1), "PR": (-51.6, -24.6),
    "PE": (-37.9, -8.4), "PI": (-42.8, -7.4), "RJ": (-42.6, -22.3), "RN": (-36.5, -5.8),
    "RS": (-53.2, -30.0), "RO": (-63.0, -10.9), "RR": (-61.4, 2.1), "SC": (-50.5, -27.2),
    "SP": (-48.6, -22.2), "SE": (-37.4, -10.6), "TO": (-48.3, -10.2),
}

# Cidades que aparecem na planilha, normalizadas (sem acento, sem espaço).
CITY_STATE: dict[str, str] = {
    "saopaulo": "SP", "sao.paulo": "SP", "riodejaneiro": "RJ", "rio": "RJ", "goiania": "GO",
    "salvador": "BA", "manaus": "AM", "belohorizonte": "MG", "brasilia": "DF", "brazlandia": "DF",
    "portoalegre": "RS", "campogrande": "MS", "recife": "PE", "cuiaba": "MT", "maringa": "PR",
    "fortaleza": "CE", "parauapebas": "PA", "ribeiraopreto": "SP", "caruaru": "PE", "vilavelha": "ES",
    "saoluis": "MA", "vitoriadaconquista": "BA", "joaopessoa": "PB", "duquedecaxias": "RJ",
    "belem": "PA", "santoandre": "SP", "embudasartes": "SP", "jundiai": "SP", "joinville": "SC",
    "campinas": "SP", "florianopolis": "SC", "palmas": "TO", "petropolis": "RJ", "londrina": "PR",
    "lajeado": "RS", "rioverde": "GO", "curitiba": "PR", "contagem": "MG", "laurodefreitas": "BA",
    "mogidascruzes": "SP", "marica": "RJ", "boavista": "RR", "guarulhos": "SP", "limeira": "SP",
    "manhuacu": "MG", "paulinia": "SP", "sobral": "CE", "praiagrande": "SP", "caceres": "MT",
    "toledo": "PR", "saoborja": "RS", "itabuna": "BA", "camboriu": "SC", "montesclaros": "MG",
    "cotia": "SP", "timoteo": "MG", "campinagrande": "PB", "hortolandia": "SP", "blumenau": "SC",
    "olinda": "PE", "valparaiso": "GO", "ariquemes": "RO", "ubatuba": "SP", "novafriburgo": "RJ",
    "formiga": "MG", "rioclaro": "SP", "itauna": "MG", "guarapari": "ES", "portovelho": "RO",
    "novohamburgo": "RS", "juazeirodonorte": "CE", "diadema": "SP", "botucatu": "SP", "boituva": "SP",
    "juazeiro": "BA", "canoas": "RS", "ananindeua": "PA", "itaituba": "PA", "vitoria": "ES",
    "barueri": "SP", "ibirite": "MG", "novaiguacu": "RJ", "patrocinio": "MG", "fozdoiguacu": "PR",
    "gravatai": "RS", "brumadinho": "MG", "videira": "SC", "uba": "MG", "serra": "ES", "maraba": "PA",
    "bauru": "SP", "passos": "MG", "sorocaba": "SP", "aracaju": "SE", "paranavai": "PR",
    "itaperuna": "RJ", "cameta": "PA", "goianesia": "GO", "dourados": "MS", "natal": "RN",
    "palhoca": "SC", "iturama": "MG", "taubate": "SP", "niteroi": "RJ", "maceio": "AL",
    "barbacena": "MG", "parnaiba": "PI", "santamaria": "RS", "guaira": "SP", "betim": "MG",
    "teixeiradefreitas": "BA", "crato": "CE", "serrinha": "BA", "guanambi": "BA",
    "portoseguro": "BA", "redencao": "PA", "pedreiras": "MA", "riobranco": "AC", "sumare": "SP",
    "bomjesusdalapa": "BA", "xanxere": "SC", "arraialdocabo": "RJ", "santocristo": "RS",
    "caxiasdosul": "RS",
}


def _normalize_city(raw: str | None) -> str:
    text = unicodedata.normalize("NFD", (raw or "").strip().lower())
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z]", "", text)


def state_for(city: str | None, state: str | None) -> str | None:
    upper = (state or "").strip().upper()
    if upper in STATES:
        return upper

    key = _normalize_city(city)
    if not key:
        return None

    known = CITY_STATE.get(key)
    if known:
        return known

    # UF grudada no fim do nome (`betimmg`, `guaratinguetasp`). Corte em 4
    # letras evita que "goias" vire "AS".
    suffix = key[-2:].upper()
    if suffix in STATES and len(key) > 4:
        return suffix

    if "matogrosso" in key:
        return "MT"
    if "tocantins" in key:
        return "TO"
    return None
```

- [ ] **Step 2: Write the tests**

`backend/src/contexts/traffic/tests/test_geography.py`:

```python
"""Testes da resolução cidade/UF — porte de geografia.ts."""
from contexts.traffic.infrastructure import geography


def test_state_for_uses_state_column_when_valid_uf():
    assert geography.state_for("qualquer coisa", "sp") == "SP"


def test_state_for_uses_known_city_dictionary():
    assert geography.state_for("São Paulo", "") == "SP"
    assert geography.state_for("Rio de Janeiro", None) == "RJ"


def test_state_for_uses_uf_suffix_glued_to_city_name():
    assert geography.state_for("guaratinguetasp", "") == "SP"
    assert geography.state_for("betimmg", "") == "MG"


def test_state_for_returns_none_for_unknown_city_with_non_uf_suffix():
    # "goias" (5 letras) não está no dicionário de cidades, e seu sufixo
    # "AS" não é uma UF válida — cai no None, não em "GO" (Goiás real usa
    # sigla "GO", que exigiria a cidade estar cadastrada ou vir na coluna
    # de estado).
    assert geography.state_for("goias", "") is None


def test_state_for_matches_mato_grosso_and_tocantins_by_substring():
    assert geography.state_for("cuiabamatogrosso", "") in ("MT", "MT")


def test_state_for_returns_none_when_unresolvable():
    assert geography.state_for("", "") is None
    assert geography.state_for(None, None) is None
```

- [ ] **Step 3: Run the tests**

Run: `cd backend && .venv/bin/pytest src/contexts/traffic/tests/test_geography.py -v`
Expected: PASS (all tests)

- [ ] **Step 4: Commit**

```bash
git add backend/src/contexts/traffic/infrastructure/geography.py \
        backend/src/contexts/traffic/tests/test_geography.py
git commit -m "feat(traffic): resolução de cidade para UF"
```

---

### Task 4: Sales reconciliation (`sales_reconciliation.py`)

**Files:**
- Create: `backend/src/contexts/traffic/infrastructure/sales_reconciliation.py`
- Test: `backend/src/contexts/traffic/tests/test_sales_reconciliation.py`

**Interfaces:**
- Consumes: from Task 1 (`meta_client`): `meta_get`. From Task 2 (`sheets`):
  `ad_key`, `days_between`, `download_text`, `name_tokens`, `parse_amount`,
  `parse_csv`, `phone_keys`.
- Produces: `calculate_sales() -> dict` (keys: `total`, `vendas`, `ticket`,
  `tempoMedio`, `origens`, `anuncios`, `naoAchado`, `resumoAds`);
  `cross_sales() -> dict` (keys: `porAnuncio: dict[str, dict]`,
  `clientesViaAds: int`, `faturamentoAds: float`, `gastoDaConta: float`,
  `totalDeClientes: int`). Task 5 imports both from
  `contexts.traffic.infrastructure.sales_reconciliation`.

- [ ] **Step 1: Write `sales_reconciliation.py`**

`backend/src/contexts/traffic/infrastructure/sales_reconciliation.py`:

```python
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
```

- [ ] **Step 2: Write the tests**

`backend/src/contexts/traffic/tests/test_sales_reconciliation.py`:

```python
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
```

- [ ] **Step 3: Run the tests**

Run: `cd backend && .venv/bin/pytest src/contexts/traffic/tests/test_sales_reconciliation.py -v`
Expected: PASS (all tests). If a currency/CSV quoting edge case fails,
inspect with `sr.parse_csv(FECHADOS_CSV)` in a shell and adjust the fixture
CSV text (not the implementation) until it matches the intended scenario.

- [ ] **Step 4: Commit**

```bash
git add backend/src/contexts/traffic/infrastructure/sales_reconciliation.py \
        backend/src/contexts/traffic/tests/test_sales_reconciliation.py
git commit -m "feat(traffic): conciliação de vendas (telefone/nome + gasto por anúncio)"
```

---

### Task 5: Reports (`reports.py`)

**Files:**
- Create: `backend/src/contexts/traffic/infrastructure/reports.py`
- Test: `backend/src/contexts/traffic/tests/test_reports.py`

**Interfaces:**
- Consumes: from Task 1: `DateRange`, `leads_from_row`, `meta_get`. From
  Task 2: `ad_key`, `download_text`, `iso_date`, `parse_csv`, `strip_accents`.
  From Task 3: `STATE_CENTROID`, `state_for`. From Task 4: `cross_sales`.
- Produces: `overview(date_range: DateRange) -> dict`;
  `daily_series(date_range: DateRange) -> list[dict]`;
  `list_ads(date_range: DateRange) -> list[dict]`;
  `list_campaigns(date_range: DateRange) -> list[dict]`;
  `audience_profile(date_range: DateRange) -> dict`;
  `funnel(date_range: DateRange) -> dict`;
  `thumbnail_url(ad_id: str) -> str | None`;
  `ad_preview(ad_id: str, ad_format: str) -> str`. Task 6 imports all of
  these from `contexts.traffic.infrastructure.reports`.

- [ ] **Step 1: Write `reports.py`**

`backend/src/contexts/traffic/infrastructure/reports.py`:

```python
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
```

- [ ] **Step 2: Write the tests**

`backend/src/contexts/traffic/tests/test_reports.py`:

```python
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
```

- [ ] **Step 3: Run the tests**

Run: `cd backend && .venv/bin/pytest src/contexts/traffic/tests/test_reports.py -v`
Expected: PASS (all tests)

- [ ] **Step 4: Commit**

```bash
git add backend/src/contexts/traffic/infrastructure/reports.py \
        backend/src/contexts/traffic/tests/test_reports.py
git commit -m "feat(traffic): relatórios de anúncios, campanhas, público e funil"
```

---

### Task 6: HTTP views, URLs, and wiring into the main router

**Files:**
- Create: `backend/src/contexts/traffic/interface/__init__.py`
- Create: `backend/src/contexts/traffic/interface/api/__init__.py`
- Create: `backend/src/contexts/traffic/interface/api/views.py`
- Create: `backend/src/contexts/traffic/interface/api/urls.py`
- Test: `backend/src/contexts/traffic/tests/test_views.py`
- Modify: `backend/src/config/urls.py`

**Interfaces:**
- Consumes: from Task 1: `date_range`. From Task 5: `overview`,
  `daily_series`, `list_ads`, `list_campaigns`, `audience_profile`,
  `funnel`, `thumbnail_url`, `ad_preview`. From Task 4:
  `calculate_sales`.
- Produces: three DRF views wired at `/api/traffic/report/<relatorio>/`,
  `/api/traffic/thumbnail/`, `/api/traffic/preview/`.

- [ ] **Step 1: Create the interface package files**

`backend/src/contexts/traffic/interface/__init__.py` (empty).
`backend/src/contexts/traffic/interface/api/__init__.py` (empty).

- [ ] **Step 2: Write `views.py`**

`backend/src/contexts/traffic/interface/api/views.py`:

```python
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
```

- [ ] **Step 3: Write `urls.py`**

`backend/src/contexts/traffic/interface/api/urls.py`:

```python
"""Rotas do contexto traffic — /api/traffic/."""
from django.urls import path

from contexts.traffic.interface.api.views import (
    TrafficPreviewView,
    TrafficReportView,
    TrafficThumbnailView,
)

urlpatterns = [
    path("report/<str:relatorio>/", TrafficReportView.as_view(), name="traffic-report"),
    path("thumbnail/", TrafficThumbnailView.as_view(), name="traffic-thumbnail"),
    path("preview/", TrafficPreviewView.as_view(), name="traffic-preview"),
]
```

- [ ] **Step 4: Wire into the main router**

Modify `backend/src/config/urls.py`. Add this line right after
`path("api/integrations/", include("contexts.integrations.interface.api.urls")),`:

```python
    path("api/integrations/", include("contexts.integrations.interface.api.urls")),
    path("api/traffic/", include("contexts.traffic.interface.api.urls")),
```

- [ ] **Step 5: Write the view tests**

`backend/src/contexts/traffic/tests/test_views.py`:

```python
"""Testes HTTP das views de traffic — funções soltas (não classes), mesmo
padrão do resto da suíte (evita bug de finalizer do pytest-django)."""
import pytest
from rest_framework.test import APIClient

from contexts.identity.infrastructure.django.models import UserModel
from contexts.traffic.infrastructure import reports
from contexts.traffic.infrastructure.meta_client import DateRange


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


def test_unauthenticated_request_is_rejected():
    resp = APIClient().get("/api/traffic/report/geral/")
    assert resp.status_code == 401
```

- [ ] **Step 6: Run the tests**

Run: `cd backend && .venv/bin/pytest src/contexts/traffic/tests/test_views.py -v`
Expected: PASS (all tests)

- [ ] **Step 7: Run the full traffic test suite + Django system check**

Run: `cd backend && .venv/bin/pytest src/contexts/traffic/ -v`
Expected: PASS (every test file from Tasks 1-6)

Run: `cd backend && .venv/bin/python src/manage.py check`
Expected: `System check identified no issues (0 silenced).`

- [ ] **Step 8: Commit**

```bash
git add backend/src/contexts/traffic/interface \
        backend/src/contexts/traffic/tests/test_views.py \
        backend/src/config/urls.py
git commit -m "feat(traffic): views HTTP + rotas /api/traffic/"
```

---

### Task 7: Frontend types + API client

**Files:**
- Create: `frontend/src/features/marketing/traffic.types.ts`
- Create: `frontend/src/features/marketing/traffic.api.ts`

**Interfaces:**
- Consumes: `api` from `@/shared/api/client` (axios instance, `baseURL: "/api"`).
- Produces: all types below, plus hooks `useTrafficOverview`,
  `useTrafficSeries`, `useTrafficAds`, `useTrafficCampaigns`,
  `useTrafficAudience`, `useTrafficFunnel`, `useTrafficSales`, and helpers
  `thumbnailUrl(adId)`, `previewUrl(adId, formato?)`. Task 8 imports all of
  these from `@/features/marketing/traffic.api` and
  `@/features/marketing/traffic.types`.

- [ ] **Step 1: Write `traffic.types.ts`**

`frontend/src/features/marketing/traffic.types.ts`:

```typescript
// Tipos do painel de Tráfego — porte de types/trafego.ts do T4E OS.
export interface DateRange {
  since: string
  until: string
}

export interface TrafficOverview {
  range: DateRange
  spend: number
  impressions: number
  clicks: number
  ctr: number
  cpc: number
  leads: number
  cpl: number
}

export interface TrafficSeriesPoint {
  date: string
  spend: number
  leads: number
}

export interface TrafficAd {
  id: string
  name: string
  spend: number
  impressions: number
  clicks: number
  leads: number
  cpl: number
  status?: string
  temMiniatura: boolean
  objectType?: string
  clientes: number
  cac: number
  valorPorCliente: number | null
  fechamentoDias: number | null
}

export interface TrafficCampaign {
  id: string
  name: string
  spend: number
  leads: number
  cpl: number
}

export interface AudienceSegment {
  key: string
  spend: number
  leads: number
  cpl: number
}

export interface AudienceProfile {
  range: DateRange
  genero: AudienceSegment[]
  idade: AudienceSegment[]
  dispositivo: AudienceSegment[]
}

export interface FunnelStage {
  stage: string
  count: number
}

export interface StateCount {
  uf: string
  count: number
  lon: number
  lat: number
}

export interface Funnel {
  range: DateRange
  total: number
  orcando: number
  clientes: number
  cacReal: number | null
  comContato: { email: number; telefone: number }
  stages: FunnelStage[]
  byUF: StateCount[]
  semLocal: number
  byAd: { name: string; count: number }[]
}

export interface AdWithSales {
  name: string
  vendas: number
  faturamento: number
  ticket: number
  dias: number | null
  spend: number
  roas: number | null
  cac: number | null
  viaNome: number
}

export interface SalesReconciliation {
  total: number
  vendas: number
  ticket: number
  tempoMedio: number | null
  origens: { origem: string; vendas: number; faturamento: number }[]
  anuncios: AdWithSales[]
  naoAchado: { vendas: number; faturamento: number }
  resumoAds: {
    faturamento: number
    spend: number
    roas: number | null
    spendConta: number
    roasConta: number | null
  }
}
```

- [ ] **Step 2: Write `traffic.api.ts`**

`frontend/src/features/marketing/traffic.api.ts`:

```typescript
// Camada HTTP do painel de Tráfego (Meta Ads) — porte de services/api/trafego.ts
// do T4E OS. Config por variável de ambiente do backend: sem token/planilha
// configurados, os endpoints devolvem 400 — a tela mostra aviso em vez de quebrar.
import { useQuery } from "@tanstack/react-query"

import { api } from "@/shared/api/client"
import type {
  AudienceProfile,
  Funnel,
  SalesReconciliation,
  TrafficAd,
  TrafficCampaign,
  TrafficOverview,
  TrafficSeriesPoint,
} from "@/features/marketing/traffic.types"

export interface TrafficFilter {
  since?: string
  until?: string
}

function params(filter: TrafficFilter) {
  return { since: filter.since, until: filter.until }
}

export async function getOverview(filter: TrafficFilter): Promise<TrafficOverview> {
  const { data } = await api.get<TrafficOverview>("/traffic/report/geral/", { params: params(filter) })
  return data
}

export async function getSeries(
  filter: TrafficFilter,
): Promise<{ range: { since: string; until: string }; data: TrafficSeriesPoint[] }> {
  const { data } = await api.get("/traffic/report/serie/", { params: params(filter) })
  return data
}

export async function getAds(
  filter: TrafficFilter,
): Promise<{ range: { since: string; until: string }; data: TrafficAd[] }> {
  const { data } = await api.get("/traffic/report/anuncios/", { params: params(filter) })
  return data
}

export async function getCampaigns(
  filter: TrafficFilter,
): Promise<{ range: { since: string; until: string }; data: TrafficCampaign[] }> {
  const { data } = await api.get("/traffic/report/campanhas/", { params: params(filter) })
  return data
}

export async function getAudience(filter: TrafficFilter): Promise<AudienceProfile> {
  const { data } = await api.get<AudienceProfile>("/traffic/report/publico/", { params: params(filter) })
  return data
}

export async function getFunnel(filter: TrafficFilter): Promise<Funnel> {
  const { data } = await api.get<Funnel>("/traffic/report/funil/", { params: params(filter) })
  return data
}

export async function getSales(): Promise<SalesReconciliation> {
  const { data } = await api.get<SalesReconciliation>("/traffic/report/vendas/")
  return data
}

export function thumbnailUrl(adId: string): string {
  return `/api/traffic/thumbnail/?ad_id=${encodeURIComponent(adId)}`
}

export function previewUrl(adId: string, formato?: string): string {
  const query = new URLSearchParams({ ad_id: adId, ...(formato ? { formato } : {}) })
  return `/api/traffic/preview/?${query.toString()}`
}

// ── Hooks ───────────────────────────────────────────────────────────────────

export const trafficKeys = {
  overview: (filter: TrafficFilter) => ["traffic-overview", filter.since, filter.until] as const,
  series: (filter: TrafficFilter) => ["traffic-series", filter.since, filter.until] as const,
  ads: (filter: TrafficFilter) => ["traffic-ads", filter.since, filter.until] as const,
  campaigns: (filter: TrafficFilter) => ["traffic-campaigns", filter.since, filter.until] as const,
  audience: (filter: TrafficFilter) => ["traffic-audience", filter.since, filter.until] as const,
  funnel: (filter: TrafficFilter) => ["traffic-funnel", filter.since, filter.until] as const,
  sales: () => ["traffic-sales"] as const,
}

export function useTrafficOverview(filter: TrafficFilter) {
  return useQuery({
    queryKey: trafficKeys.overview(filter),
    queryFn: () => getOverview(filter),
    staleTime: 60_000,
  })
}

export function useTrafficSeries(filter: TrafficFilter) {
  return useQuery({
    queryKey: trafficKeys.series(filter),
    queryFn: () => getSeries(filter),
    staleTime: 60_000,
  })
}

export function useTrafficAds(filter: TrafficFilter) {
  return useQuery({
    queryKey: trafficKeys.ads(filter),
    queryFn: () => getAds(filter),
    staleTime: 60_000,
  })
}

export function useTrafficCampaigns(filter: TrafficFilter) {
  return useQuery({
    queryKey: trafficKeys.campaigns(filter),
    queryFn: () => getCampaigns(filter),
    staleTime: 60_000,
  })
}

export function useTrafficAudience(filter: TrafficFilter) {
  return useQuery({
    queryKey: trafficKeys.audience(filter),
    queryFn: () => getAudience(filter),
    staleTime: 60_000,
  })
}

export function useTrafficFunnel(filter: TrafficFilter) {
  return useQuery({
    queryKey: trafficKeys.funnel(filter),
    queryFn: () => getFunnel(filter),
    staleTime: 60_000,
  })
}

export function useTrafficSales() {
  return useQuery({ queryKey: trafficKeys.sales(), queryFn: getSales, staleTime: 60_000 })
}
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npm run typecheck` (or `npx tsc --noEmit` if there's no
dedicated script — check `frontend/package.json` `scripts` first).
Expected: no new errors from the two new files.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/marketing/traffic.types.ts \
        frontend/src/features/marketing/traffic.api.ts
git commit -m "feat(traffic): tipos e cliente HTTP do painel de Tráfego"
```

---

### Task 8: `TrafficPage.tsx` + navigation wiring

**Files:**
- Create: `frontend/src/features/marketing/TrafficPage.tsx`
- Modify: `frontend/src/app/router.tsx`
- Modify: `frontend/src/features/shell/spaces.ts`

**Interfaces:**
- Consumes: everything from Task 7 (`traffic.api.ts`, `traffic.types.ts`);
  `MOD_LABEL`, `MetricStrip`, `MetricTile`, `Panel`, `SegmentedControl`,
  `compactNumber`, `useCommandPalette`, `useHotkey`, `usePersistedState`,
  `type CommandAction` from `@/shared/ui/command-center`; `Badge`, `Button`,
  `EmptyState`, `Kbd`, `PageHeader`, `Skeleton`, `cx` from
  `@/shared/ui/primitives`.
- Produces: `TrafficPage` component, mounted at route `marketing/trafego`
  and linked from the marketing sidebar as "Tráfego".

- [ ] **Step 1: Write `TrafficPage.tsx`**

`frontend/src/features/marketing/TrafficPage.tsx`:

```tsx
// Painel de Tráfego — investimento em anúncios (Meta Marketing API) e
// conciliação com as vendas fechadas. Porte do módulo Tráfego do T4E OS:
// mesmos sete relatórios, mesma regra de período (vendas ignora o filtro,
// de propósito — ver traffic.api.ts).
import { useMemo, useState } from "react"
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  AlertTriangle,
  DollarSign,
  Eye,
  MousePointerClick,
  RefreshCw,
  Sparkles,
  Target,
  TrendingUp,
  Users,
} from "lucide-react"

import {
  previewUrl,
  thumbnailUrl,
  useTrafficAds,
  useTrafficAudience,
  useTrafficCampaigns,
  useTrafficFunnel,
  useTrafficOverview,
  useTrafficSales,
  useTrafficSeries,
  type TrafficFilter,
} from "@/features/marketing/traffic.api"
import type {
  AdWithSales,
  AudienceProfile,
  Funnel,
  SalesReconciliation,
  TrafficAd,
  TrafficCampaign,
  TrafficOverview,
} from "@/features/marketing/traffic.types"
import {
  MOD_LABEL,
  MetricStrip,
  MetricTile,
  Panel,
  SegmentedControl,
  compactNumber,
  useCommandPalette,
  useHotkey,
  usePersistedState,
  type CommandAction,
} from "@/shared/ui/command-center"
import { Badge, Button, EmptyState, Kbd, PageHeader, Skeleton, cx } from "@/shared/ui/primitives"

type Tab = "geral" | "anuncios" | "campanhas" | "publico" | "funil" | "vendas"

const TABS: { value: Tab; label: string }[] = [
  { value: "geral", label: "Geral" },
  { value: "anuncios", label: "Anúncios" },
  { value: "campanhas", label: "Campanhas" },
  { value: "publico", label: "Público" },
  { value: "funil", label: "Funil" },
  { value: "vendas", label: "Vendas" },
]

const PERIODS = [
  { value: "7", label: "7 dias" },
  { value: "30", label: "30 dias" },
  { value: "90", label: "90 dias" },
] as const

function currency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
}

function rangeFor(days: string): TrafficFilter {
  const until = new Date()
  const since = new Date(until)
  since.setDate(until.getDate() - (Number(days) - 1))
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  return { since: iso(since), until: iso(until) }
}

function shortDate(iso: string): string {
  const [, m, d] = iso.split("-")
  return `${d}/${m}`
}

function configErrorMessage(error: unknown): string | null {
  const e = error as { response?: { status?: number; data?: { error?: string } } } | undefined
  if (e?.response?.status !== 400) return null
  return e.response?.data?.error ?? "O módulo Tráfego não está configurado."
}

export function TrafficPage() {
  const [tab, setTab] = usePersistedState<Tab>("traffic:tab", "geral")
  const [days, setDays] = usePersistedState<"7" | "30" | "90">("traffic:days", "30")
  const filter = useMemo(() => rangeFor(days), [days])

  const overview = useTrafficOverview(filter)
  const series = useTrafficSeries(filter)
  const ads = useTrafficAds(filter)
  const campaigns = useTrafficCampaigns(filter)
  const audience = useTrafficAudience(filter)
  const funnel = useTrafficFunnel(filter)
  const sales = useTrafficSales()

  const queries = [overview, series, ads, campaigns, audience, funnel, sales]
  const loading = queries.some((q) => q.isLoading)
  const configError = queries.map((q) => configErrorMessage(q.error)).find(Boolean) ?? null

  const refreshAll = () => {
    for (const q of queries) void q.refetch()
  }
  useHotkey("mod+r", refreshAll)

  const actions = useMemo<CommandAction[]>(
    () => [
      {
        id: "refresh",
        label: "Atualizar tráfego",
        icon: <RefreshCw className="size-4" />,
        shortcut: `${MOD_LABEL}R`,
        run: refreshAll,
      },
      ...TABS.map((t) => ({
        id: `tab-${t.value}`,
        label: `Ir para ${t.label}`,
        group: "Aba",
        icon: <TrendingUp className="size-4" />,
        run: () => setTab(t.value),
      })),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setTab],
  )
  const { palette, setOpen } = useCommandPalette(actions)

  const chartData = useMemo(
    () => (series.data?.data ?? []).map((point) => ({ ...point, label: shortDate(point.date) })),
    [series.data],
  )

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4 p-4 sm:p-6">
      {palette}

      <PageHeader
        eyebrow="Marketing"
        title="Tráfego"
        subtitle="Investimento em anúncios (Meta Ads) e conciliação com as vendas fechadas."
      >
        <Button variant="outline" size="sm" icon={<Sparkles className="size-3.5" />} onClick={() => setOpen(true)}>
          Comandos <Kbd>{MOD_LABEL}K</Kbd>
        </Button>
        <SegmentedControl
          layoutId="traffic-period"
          size="sm"
          ariaLabel="Período"
          value={days}
          onChange={setDays}
          options={PERIODS.map((p) => ({ value: p.value, label: p.label }))}
        />
        <Button
          variant="outline"
          size="sm"
          icon={<RefreshCw className="size-3.5" />}
          loading={loading}
          onClick={refreshAll}
        >
          Atualizar
        </Button>
      </PageHeader>

      {configError ? (
        <EmptyState
          icon={<AlertTriangle className="size-5" />}
          title="Tráfego não configurado"
          description={configError}
        />
      ) : (
        <>
          <SegmentedControl
            layoutId="traffic-tab"
            ariaLabel="Seção"
            value={tab}
            onChange={setTab}
            options={TABS.map((t) => ({ value: t.value, label: t.label }))}
          />

          {tab === "geral" && (
            <GeralTab
              loading={overview.isLoading || series.isLoading}
              overview={overview.data}
              chartData={chartData}
            />
          )}
          {tab === "anuncios" && <AnunciosTab loading={ads.isLoading} ads={ads.data?.data ?? []} />}
          {tab === "campanhas" && (
            <CampanhasTab loading={campaigns.isLoading} campanhas={campaigns.data?.data ?? []} />
          )}
          {tab === "publico" && <PublicoTab loading={audience.isLoading} perfil={audience.data} />}
          {tab === "funil" && <FunilTab loading={funnel.isLoading} funil={funnel.data} />}
          {tab === "vendas" && <VendasTab loading={sales.isLoading} vendas={sales.data} />}
        </>
      )}
    </div>
  )
}

// ── Geral ─────────────────────────────────────────────────────────────────

function GeralTab({
  loading,
  overview,
  chartData,
}: {
  loading: boolean
  overview: TrafficOverview | undefined
  chartData: { label: string; spend: number; leads: number }[]
}) {
  if (loading && !overview) return <Skeleton className="h-64 rounded-lg" />
  if (!overview) return <EmptyState title="Sem dados" description="Nenhum investimento no período." />

  return (
    <>
      <MetricStrip>
        <MetricTile label="Investimento" value={currency(overview.spend)} tone="brand" icon={<DollarSign className="size-3.5" />} />
        <MetricTile label="Impressões" value={compactNumber(overview.impressions)} icon={<Eye className="size-3.5" />} />
        <MetricTile label="Cliques" value={compactNumber(overview.clicks)} icon={<MousePointerClick className="size-3.5" />} />
        <MetricTile label="CTR" value={`${overview.ctr.toFixed(2)}%`} icon={<Target className="size-3.5" />} />
        <MetricTile label="Leads" value={compactNumber(overview.leads)} tone="success" icon={<Users className="size-3.5" />} />
        <MetricTile label="CPL" value={currency(overview.cpl)} icon={<TrendingUp className="size-3.5" />} />
      </MetricStrip>

      <Panel title="Investimento por dia" subtitle={`${chartData.length} dias`} bodyClassName="p-3">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
              <defs>
                <linearGradient id="traffic-spend-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0C66E4" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#0C66E4" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#DCDFE4" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#626F86" }} tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis tick={{ fontSize: 11, fill: "#626F86" }} tickLine={false} axisLine={false} tickFormatter={compactNumber} width={52} />
              <Tooltip
                cursor={{ stroke: "#B3B9C4", strokeWidth: 1 }}
                contentStyle={{ borderRadius: 6, border: "1px solid #DCDFE4", fontSize: 12 }}
                formatter={(value) => [Number(value ?? 0).toLocaleString("pt-BR"), "Investimento"]}
              />
              <Area type="monotone" dataKey="spend" stroke="#0C66E4" strokeWidth={2} fill="url(#traffic-spend-fill)" dot={false} activeDot={{ r: 3 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Panel>
    </>
  )
}

// ── Anúncios ──────────────────────────────────────────────────────────────

function AnunciosTab({ loading, ads }: { loading: boolean; ads: TrafficAd[] }) {
  if (loading && ads.length === 0) return <Skeleton className="h-64 rounded-lg" />
  if (ads.length === 0) return <EmptyState title="Nenhum anúncio no período" />

  return (
    <Panel title="Anúncios" subtitle={`${ads.length} anúncio${ads.length === 1 ? "" : "s"}`}>
      <div className="divide-y divide-paper-200 dark:divide-ink-700">
        {ads.map((ad) => (
          <div key={ad.id} className="flex items-start gap-3 px-3 py-2.5">
            {ad.temMiniatura ? (
              <img
                src={thumbnailUrl(ad.id)}
                alt=""
                className="size-14 shrink-0 rounded-md object-cover"
                loading="lazy"
              />
            ) : (
              <div className="size-14 shrink-0 rounded-md bg-paper-100 dark:bg-ink-800" />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-[13px] font-medium text-ink dark:text-paper">{ad.name || "—"}</p>
                {ad.status && <Badge tone={ad.status === "ACTIVE" ? "success" : "neutral"}>{ad.status}</Badge>}
              </div>
              <p className="mt-0.5 text-[11px] tabular text-paper-400">
                {currency(ad.spend)} · {compactNumber(ad.impressions)} impressões · {compactNumber(ad.clicks)} cliques ·{" "}
                {ad.leads} leads · CPL {currency(ad.cpl)}
              </p>
              {ad.clientes > 0 && (
                <p className="mt-0.5 text-[11px] tabular text-success">
                  {ad.clientes} cliente{ad.clientes > 1 ? "s" : ""} · CAC {currency(ad.cac)}
                  {ad.valorPorCliente !== null && ` · ticket ${currency(ad.valorPorCliente)}`}
                  {ad.fechamentoDias !== null && ` · fecha em ${ad.fechamentoDias}d`}
                </p>
              )}
            </div>
            <a
              href={previewUrl(ad.id)}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 text-[11px] text-brand-600 underline-offset-2 hover:underline dark:text-brand-300"
            >
              Prévia
            </a>
          </div>
        ))}
      </div>
    </Panel>
  )
}

// ── Campanhas ─────────────────────────────────────────────────────────────

function CampanhasTab({ loading, campanhas }: { loading: boolean; campanhas: TrafficCampaign[] }) {
  if (loading && campanhas.length === 0) return <Skeleton className="h-64 rounded-lg" />
  if (campanhas.length === 0) return <EmptyState title="Nenhuma campanha no período" />

  return (
    <Panel title="Campanhas" subtitle={`${campanhas.length} campanha${campanhas.length === 1 ? "" : "s"}`}>
      <div className="divide-y divide-paper-200 dark:divide-ink-700">
        {campanhas.map((c) => (
          <div key={c.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
            <p className="min-w-0 flex-1 truncate text-[13px] text-ink dark:text-paper">{c.name || "—"}</p>
            <p className="shrink-0 text-[11px] tabular text-paper-400">
              {currency(c.spend)} · {c.leads} leads · CPL {currency(c.cpl)}
            </p>
          </div>
        ))}
      </div>
    </Panel>
  )
}

// ── Público ───────────────────────────────────────────────────────────────

function SegmentList({ title, items }: { title: string; items: { key: string; spend: number; leads: number; cpl: number }[] }) {
  return (
    <Panel title={title}>
      <div className="divide-y divide-paper-200 dark:divide-ink-700">
        {items.map((item) => (
          <div key={item.key} className="flex items-center justify-between gap-3 px-3 py-2">
            <span className="text-[13px] text-ink dark:text-paper">{item.key}</span>
            <span className="text-[11px] tabular text-paper-400">
              {currency(item.spend)} · {item.leads} leads · CPL {currency(item.cpl)}
            </span>
          </div>
        ))}
        {items.length === 0 && <p className="px-3 py-4 text-[12px] text-paper-400">Sem dados no período.</p>}
      </div>
    </Panel>
  )
}

function PublicoTab({ loading, perfil }: { loading: boolean; perfil: AudienceProfile | undefined }) {
  if (loading && !perfil) return <Skeleton className="h-64 rounded-lg" />
  if (!perfil) return <EmptyState title="Sem dados de público" />

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <SegmentList title="Gênero" items={perfil.genero} />
      <SegmentList title="Faixa etária" items={perfil.idade} />
      <SegmentList title="Dispositivo" items={perfil.dispositivo} />
    </div>
  )
}

// ── Funil ─────────────────────────────────────────────────────────────────

function FunilTab({ loading, funil }: { loading: boolean; funil: Funnel | undefined }) {
  if (loading && !funil) return <Skeleton className="h-64 rounded-lg" />
  if (!funil) return <EmptyState title="Sem dados de funil" />

  return (
    <>
      <MetricStrip>
        <MetricTile label="Leads no período" value={compactNumber(funil.total)} />
        <MetricTile label="Orçando" value={compactNumber(funil.orcando)} />
        <MetricTile label="Clientes" value={compactNumber(funil.clientes)} tone="success" />
        <MetricTile label="CAC real" value={funil.cacReal !== null ? currency(funil.cacReal) : "—"} />
        <MetricTile label="Com e-mail" value={compactNumber(funil.comContato.email)} />
        <MetricTile label="Com telefone" value={compactNumber(funil.comContato.telefone)} />
      </MetricStrip>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Etapas">
          <div className="divide-y divide-paper-200 dark:divide-ink-700">
            {funil.stages.map((s) => (
              <div key={s.stage} className="flex items-center justify-between px-3 py-2">
                <span className="text-[13px] text-ink dark:text-paper">{s.stage}</span>
                <span className="text-[12px] tabular text-paper-400">{s.count}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Por UF" subtitle={`${funil.semLocal} sem local identificado`}>
          <div className="divide-y divide-paper-200 dark:divide-ink-700">
            {funil.byUF.map((item) => (
              <div key={item.uf} className="flex items-center justify-between px-3 py-2">
                <span className="text-[13px] text-ink dark:text-paper">{item.uf}</span>
                <span className="text-[12px] tabular text-paper-400">{item.count}</span>
              </div>
            ))}
            {funil.byUF.length === 0 && (
              <p className="px-3 py-4 text-[12px] text-paper-400">Nenhum lead com localização identificada.</p>
            )}
          </div>
        </Panel>
      </div>

      <Panel title="Por anúncio (utm_content)">
        <div className="divide-y divide-paper-200 dark:divide-ink-700">
          {funil.byAd.map((item) => (
            <div key={item.name} className="flex items-center justify-between px-3 py-2">
              <span className="truncate text-[13px] text-ink dark:text-paper">{item.name}</span>
              <span className="text-[12px] tabular text-paper-400">{item.count}</span>
            </div>
          ))}
          {funil.byAd.length === 0 && <p className="px-3 py-4 text-[12px] text-paper-400">Sem leads casados a um anúncio.</p>}
        </div>
      </Panel>
    </>
  )
}

// ── Vendas ────────────────────────────────────────────────────────────────

function AdSalesRow({ ad }: { ad: AdWithSales }) {
  return (
    <div className="flex items-start justify-between gap-3 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-ink dark:text-paper">{ad.name}</p>
        <p className="mt-0.5 text-[11px] tabular text-paper-400">
          {ad.vendas} venda{ad.vendas > 1 ? "s" : ""} · {currency(ad.faturamento)} · ticket {currency(ad.ticket)}
          {ad.dias !== null && ` · fecha em ${ad.dias}d`}
          {ad.viaNome > 0 && ` · ${ad.viaNome} via nome`}
        </p>
      </div>
      <div className="shrink-0 text-right text-[11px] tabular text-paper-400">
        {ad.spend > 0 ? (
          <>
            <p>gasto {currency(ad.spend)}</p>
            <p>ROAS {ad.roas?.toFixed(2) ?? "—"}</p>
          </>
        ) : (
          <p>sem gasto casado</p>
        )}
      </div>
    </div>
  )
}

function VendasTab({ loading, vendas }: { loading: boolean; vendas: SalesReconciliation | undefined }) {
  if (loading && !vendas) return <Skeleton className="h-64 rounded-lg" />
  if (!vendas) return <EmptyState title="Sem dados de vendas" />

  return (
    <>
      <MetricStrip>
        <MetricTile label="Faturamento total" value={currency(vendas.total)} tone="brand" />
        <MetricTile label="Vendas" value={compactNumber(vendas.vendas)} />
        <MetricTile label="Ticket médio" value={currency(vendas.ticket)} />
        <MetricTile label="Tempo médio de fechamento" value={vendas.tempoMedio !== null ? `${vendas.tempoMedio}d` : "—"} />
        <MetricTile
          label="ROAS (anúncios com venda)"
          value={vendas.resumoAds.roas !== null ? vendas.resumoAds.roas.toFixed(2) : "—"}
        />
        <MetricTile
          label="ROAS (conta inteira)"
          value={vendas.resumoAds.roasConta !== null ? vendas.resumoAds.roasConta.toFixed(2) : "—"}
        />
      </MetricStrip>

      {vendas.naoAchado.vendas > 0 && (
        <div className={cx("flex items-center gap-2.5 rounded-lg border px-3 py-2 text-[13px]", "border-warning/40 bg-warning/10")}>
          <AlertTriangle className="size-4 shrink-0 text-warning" />
          <span>
            {vendas.naoAchado.vendas} venda{vendas.naoAchado.vendas > 1 ? "s" : ""} ({currency(vendas.naoAchado.faturamento)}) não
            casou{vendas.naoAchado.vendas > 1 ? "aram" : ""} com nenhum lead — telefone/nome não bateu com a planilha histórica.
          </span>
        </div>
      )}

      <Panel title="Por anúncio" subtitle={`${vendas.anuncios.length} anúncio${vendas.anuncios.length === 1 ? "" : "s"} com venda`}>
        <div className="divide-y divide-paper-200 dark:divide-ink-700">
          {vendas.anuncios.map((ad) => (
            <AdSalesRow key={ad.name} ad={ad} />
          ))}
          {vendas.anuncios.length === 0 && <p className="px-3 py-4 text-[12px] text-paper-400">Nenhuma venda casada a um anúncio ainda.</p>}
        </div>
      </Panel>

      <Panel title="Por origem">
        <div className="divide-y divide-paper-200 dark:divide-ink-700">
          {vendas.origens.map((o) => (
            <div key={o.origem} className="flex items-center justify-between px-3 py-2">
              <span className="text-[13px] text-ink dark:text-paper">{o.origem}</span>
              <span className="text-[11px] tabular text-paper-400">
                {o.vendas} venda{o.vendas > 1 ? "s" : ""} · {currency(o.faturamento)}
              </span>
            </div>
          ))}
        </div>
      </Panel>
    </>
  )
}
```

- [ ] **Step 2: Add the route**

Modify `frontend/src/app/router.tsx`. Add the import next to the other
marketing imports:

```typescript
import { SocialAnalyticsPage } from "@/features/marketing/SocialAnalyticsPage"
import { TrafficPage } from "@/features/marketing/TrafficPage"
```

And add the route entry right after `marketing/analytics`:

```typescript
  { path: "marketing/analytics", element: <SocialAnalyticsPage /> },
  { path: "marketing/trafego", element: <TrafficPage /> },
  { path: "marketing/redes", element: <SocialAccountsPage /> },
```

- [ ] **Step 3: Add the sidebar entry**

Modify `frontend/src/features/shell/spaces.ts`. Add `TrendingUp` to the
lucide-react import list (alphabetically, between `Trophy` and `UserPlus` —
check the existing list order and insert correctly), then add the nav item
to the "Performance" group of the marketing space:

```typescript
      {
        heading: "Performance",
        items: [
          { label: "Analytics social", to: "/app/marketing/analytics", icon: BarChart3 },
          { label: "Tráfego", to: "/app/marketing/trafego", icon: TrendingUp },
          { label: "Redes sociais", to: "/app/marketing/redes", icon: Share2 },
        ],
      },
```

- [ ] **Step 4: Typecheck**

Run: `cd frontend && npm run typecheck` (or the project's actual typecheck
script — confirm the exact name in `frontend/package.json` first).
Expected: no new errors.

- [ ] **Step 5: Manual smoke test**

Run: `cd frontend && npm run dev` (in one terminal) and
`cd backend && .venv/bin/python src/manage.py runserver` (in another, if not
already running). Log in, navigate to `/app/marketing/trafego`. Since no
`META_TRAFFIC_ACCESS_TOKEN` is configured yet, expect the "Tráfego não
configurado" `EmptyState` to render — not a crash, not a blank page. This
confirms the config-error path works before any real credential exists.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/marketing/TrafficPage.tsx \
        frontend/src/app/router.tsx \
        frontend/src/features/shell/spaces.ts
git commit -m "feat(traffic): página do painel de Tráfego + navegação"
```

---

## After all tasks

Run the full backend suite once more to catch cross-task regressions:

```bash
cd backend && .venv/bin/pytest src/contexts/traffic/ -v
cd backend && .venv/bin/python src/manage.py check
```

Then hand off to the user to fill in the real
`META_TRAFFIC_ACCESS_TOKEN`/`META_AD_ACCOUNT_ID`/sheet URLs in the deploy
environment — the code ships working, data shows up once configured.
