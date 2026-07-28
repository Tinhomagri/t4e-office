"""Entidade da conexão com uma instância Chatwoot — Python puro."""
from dataclasses import dataclass
from datetime import datetime

from shared.domain.errors import ValidationError


@dataclass
class ChatwootConnection:
    """Como o workspace fala com a instância Chatwoot dele.

    `access_token` circula em claro só dentro do processo: quem persiste cifra
    (ver `infrastructure/django/repositories_impl.py`) e quem serializa para o
    frontend nunca devolve o campo.
    """

    id: str | None
    workspace_id: str
    base_url: str
    account_id: int
    access_token: str = ""
    webhook_secret: str = ""
    status: str = "disconnected"
    last_error: str = ""
    last_verified_at: datetime | None = None
    agent_name: str = ""
    agent_email: str = ""

    def __post_init__(self) -> None:
        self.base_url = self.base_url.strip().rstrip("/")
        if not self.base_url:
            raise ValidationError("A URL da instância Chatwoot é obrigatória.")
        if not self.base_url.startswith(("http://", "https://")):
            raise ValidationError("A URL deve começar com http:// ou https://.")
        if self.account_id <= 0:
            raise ValidationError("O ID da conta no Chatwoot deve ser positivo.")

    @property
    def is_usable(self) -> bool:
        """Dá para chamar a API? Precisa de token, não importa o último status."""
        return bool(self.access_token)
