"""Porta de saída: acesso à Google Chat API (autenticação de usuário)."""
from abc import ABC, abstractmethod

from contexts.google.domain.entities.chat import ChatMessage, ChatSpace


class ChatError(Exception):
    """Falha ao falar com a Chat API (5xx, rate limit, escopo faltando, etc.)."""


class ChatGateway(ABC):
    """Contrato de operações no Google Chat do usuário."""

    @abstractmethod
    def list_spaces(self, *, access_token: str) -> list[ChatSpace]:
        """Lista os espaços (DMs e grupos) de que o usuário faz parte."""

    @abstractmethod
    def list_messages(
        self, *, access_token: str, space_id: str, page_size: int = 50
    ) -> list[ChatMessage]:
        """Lista as mensagens mais recentes de um espaço, mais antiga primeiro."""

    @abstractmethod
    def send_message(
        self, *, access_token: str, space_id: str, text: str
    ) -> ChatMessage:
        """Envia uma mensagem de texto no espaço, em nome do usuário."""

    @abstractmethod
    def create_dm(self, *, access_token: str, member_email: str) -> ChatSpace:
        """Cria (ou recupera, se já existir) um DM 1:1 com o e-mail informado."""
