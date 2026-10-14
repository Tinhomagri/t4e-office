"""Formato de saída do Leonardo: datas ISO em America/Sao_Paulo, horas decimais."""
from __future__ import annotations

from datetime import date, datetime

from django.utils import timezone


def dt(value: datetime | None) -> str | None:
    return timezone.localtime(value).isoformat() if value else None


def day(value: date | datetime | None) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        value = timezone.localtime(value).date()
    return value.isoformat()


def hours(seconds: int | float | None) -> float | None:
    return None if seconds is None else round(seconds / 3600, 2)
