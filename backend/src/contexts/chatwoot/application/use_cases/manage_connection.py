"""Casos de uso da conexão com a instância Chatwoot do workspace."""
from __future__ import annotations

from dataclasses import dataclass

from contexts.chatwoot.domain.entities.connection import ChatwootConnection
from shared.domain.errors import DomainError


@dataclass
class ConnectChatwoot:
    """Salva a conexão e já valida o token contra a instância.

    Guardar credencial que não funciona é pior do que não guardar: o usuário só
    descobriria ao abrir a caixa de entrada. Por isso o connect é atômico —
    salva, verifica, e marca `error` com a mensagem real se a verificação falha.
    """

    connections: object  # DjangoConnectionRepository
    build_gateway: object  # callable(ChatwootConnection) -> ChatwootGateway

    def execute(
        self,
        *,
        workspace_id: str,
        base_url: str,
        account_id: int,
        access_token: str,
        user_id: str | None = None,
    ) -> ChatwootConnection:
        connection = self.connections.upsert(
            workspace_id=workspace_id,
            base_url=base_url,
            account_id=account_id,
            access_token=access_token,
            user_id=user_id,
        )
        try:
            profile = self.build_gateway(connection).verify()
        except DomainError as exc:
            self.connections.mark_error(workspace_id, str(exc))
            raise
        return self.connections.mark_verified(workspace_id, agent=profile)


@dataclass
class VerifyConnection:
    """Revalida a conexão salva sem alterar credenciais."""

    connections: object
    build_gateway: object

    def execute(self, *, workspace_id: str) -> ChatwootConnection:
        connection = self.connections.require(workspace_id)
        try:
            profile = self.build_gateway(connection).verify()
        except DomainError as exc:
            self.connections.mark_error(workspace_id, str(exc))
            raise
        return self.connections.mark_verified(workspace_id, agent=profile)


@dataclass
class GetConnection:
    """Lê a conexão do workspace (ou None — a tela mostra o formulário vazio)."""

    connections: object

    def execute(self, *, workspace_id: str) -> ChatwootConnection | None:
        return self.connections.get(workspace_id)


@dataclass
class DisconnectChatwoot:
    """Remove a conexão. Os vínculos conversa↔negócio ficam — o Chatwoot pode voltar."""

    connections: object

    def execute(self, *, workspace_id: str) -> None:
        self.connections.delete(workspace_id)
