"""Entidade de histórico de alterações de card — Python puro."""
from dataclasses import dataclass
from datetime import datetime


@dataclass
class CardHistoryEntry:
    """Registro imutável de uma mudança de campo num card.

    `old_value`/`new_value` guardam representação textual do valor (antes/depois),
    suficiente para a linha do tempo de atividade estilo Jira.
    """

    id: str | None
    card_id: str
    author_id: str | None
    field: str
    old_value: str
    new_value: str
    created_at: datetime | None = None
    author_name: str = ""
