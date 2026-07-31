"""Casos de uso: Google Chat (listar espaços/mensagens, enviar, criar DM)."""
from contexts.google.application.use_cases.get_valid_credentials import (
    GetValidCredentials,
)
from contexts.google.domain.entities.chat import ChatMessage, ChatSpace
from contexts.google.domain.ports.chat_gateway import ChatGateway


class ListChatSpaces:
    def __init__(self, *, chat_gateway: ChatGateway, get_valid_credentials: GetValidCredentials):
        self.chat_gateway = chat_gateway
        self.get_valid_credentials = get_valid_credentials

    def execute(self, *, user_id: str) -> list[ChatSpace]:
        access_token = self.get_valid_credentials.execute(user_id=user_id)
        return self.chat_gateway.list_spaces(access_token=access_token)


class ListChatMessages:
    def __init__(self, *, chat_gateway: ChatGateway, get_valid_credentials: GetValidCredentials):
        self.chat_gateway = chat_gateway
        self.get_valid_credentials = get_valid_credentials

    def execute(self, *, user_id: str, space_id: str) -> list[ChatMessage]:
        access_token = self.get_valid_credentials.execute(user_id=user_id)
        return self.chat_gateway.list_messages(access_token=access_token, space_id=space_id)


class SendChatMessage:
    def __init__(self, *, chat_gateway: ChatGateway, get_valid_credentials: GetValidCredentials):
        self.chat_gateway = chat_gateway
        self.get_valid_credentials = get_valid_credentials

    def execute(self, *, user_id: str, space_id: str, text: str) -> ChatMessage:
        access_token = self.get_valid_credentials.execute(user_id=user_id)
        return self.chat_gateway.send_message(
            access_token=access_token, space_id=space_id, text=text
        )


class CreateChatDm:
    def __init__(self, *, chat_gateway: ChatGateway, get_valid_credentials: GetValidCredentials):
        self.chat_gateway = chat_gateway
        self.get_valid_credentials = get_valid_credentials

    def execute(self, *, user_id: str, member_email: str) -> ChatSpace:
        access_token = self.get_valid_credentials.execute(user_id=user_id)
        return self.chat_gateway.create_dm(access_token=access_token, member_email=member_email)
