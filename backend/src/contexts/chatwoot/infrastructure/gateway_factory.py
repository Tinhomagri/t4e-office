"""Monta o gateway do Chatwoot a partir da conexão salva do workspace."""
from __future__ import annotations

from contexts.chatwoot.domain.entities.connection import ChatwootConnection
from contexts.chatwoot.infrastructure.chatwoot_api import ChatwootHttpGateway
from contexts.chatwoot.infrastructure.django.repositories_impl import (
    DjangoConnectionRepository,
)
from shared.domain.errors import ValidationError


def gateway_for(connection: ChatwootConnection) -> ChatwootHttpGateway:
    """Cliente autenticado para uma conexão já carregada."""
    if not connection.is_usable:
        raise ValidationError(
            "A conexão com o Chatwoot está sem token. Reconecte em "
            "Comercial → Atendimento → Conexão."
        )
    return ChatwootHttpGateway(
        base_url=connection.base_url,
        account_id=connection.account_id,
        access_token=connection.access_token,
    )


def gateway_for_workspace(workspace_id: str) -> tuple[ChatwootConnection, ChatwootHttpGateway]:
    """Atalho usado pelas views: carrega a conexão e devolve o cliente pronto."""
    connection = DjangoConnectionRepository().require(workspace_id)
    return connection, gateway_for(connection)
