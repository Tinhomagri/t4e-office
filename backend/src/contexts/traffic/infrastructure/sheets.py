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
