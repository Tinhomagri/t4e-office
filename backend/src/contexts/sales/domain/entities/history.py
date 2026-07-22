"""Entidade de histórico de alterações de um negócio — Python puro."""
from dataclasses import dataclass
from datetime import datetime


@dataclass
class DealHistoryEntry:
    """Registro imutável de uma mudança de campo num negócio."""

    id: str | None
    deal_id: str
    author_id: str | None
    field: str
    from_value: str
    to_value: str
    created_at: datetime | None = None
    author_name: str = ""
