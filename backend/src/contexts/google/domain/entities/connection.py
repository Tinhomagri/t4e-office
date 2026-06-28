"""Entidade de conexão Google — Python puro, sem Django."""
from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum


class ConnectionStatus(StrEnum):
    """Estado da conexão Google do usuário."""

    ACTIVE = "active"
    REVOKED = "revoked"


@dataclass
class GoogleConnection:
    """Vincula um usuário do app à sua conta Google + tokens OAuth.

    Os tokens ficam em texto plano na entidade; a cifragem é responsabilidade
    da infraestrutura (repositório) ao persistir.
    """

    user_id: str
    google_email: str
    refresh_token: str
    access_token: str
    expiry: datetime
    scopes: list[str] = field(default_factory=list)
    status: ConnectionStatus = ConnectionStatus.ACTIVE
    id: str | None = None

    def is_expired(self, *, now: datetime) -> bool:
        """Indica se o access_token já venceu (com folga de 60s)."""
        from datetime import timedelta

        return now >= (self.expiry - timedelta(seconds=60))

    def mark_revoked(self) -> None:
        self.status = ConnectionStatus.REVOKED
