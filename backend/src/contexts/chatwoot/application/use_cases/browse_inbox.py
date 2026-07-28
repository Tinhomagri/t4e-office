"""Leitura da caixa de entrada: conversas, mensagens e catálogos."""
from __future__ import annotations

from dataclasses import dataclass

from contexts.chatwoot.domain.entities.conversation import (
    Conversation,
    ConversationPage,
    Message,
)


@dataclass
class ListConversations:
    """Lista conversas e anexa o vínculo comercial de cada uma.

    O Chatwoot não conhece nosso funil, então o `deal` vem do banco local. Uma
    query só para a página inteira (`map_for`) — nada de N+1 por conversa.
    """

    gateway: object
    links: object  # DjangoConversationLinkRepository

    def execute(
        self,
        *,
        workspace_id: str,
        status: str | None = None,
        assignee_type: str | None = None,
        inbox_id: int | None = None,
        team_id: int | None = None,
        labels: list[str] | None = None,
        query: str | None = None,
        page: int = 1,
    ) -> tuple[ConversationPage, dict[int, dict]]:
        result = self.gateway.list_conversations(
            status=status,
            assignee_type=assignee_type,
            inbox_id=inbox_id,
            team_id=team_id,
            labels=labels,
            query=query,
            page=page,
        )
        link_map = self.links.map_for(
            workspace_id=workspace_id,
            conversation_ids=[c.id for c in result.conversations],
        )
        return result, link_map


@dataclass
class FilterConversations:
    """Busca avançada com o payload de filtros do Chatwoot (AND/OR)."""

    gateway: object
    links: object

    def execute(
        self, *, workspace_id: str, payload: list[dict], page: int = 1
    ) -> tuple[ConversationPage, dict[int, dict]]:
        result = self.gateway.filter_conversations(payload, page=page)
        link_map = self.links.map_for(
            workspace_id=workspace_id,
            conversation_ids=[c.id for c in result.conversations],
        )
        return result, link_map


@dataclass
class GetConversation:
    """Detalhe da conversa + vínculo comercial."""

    gateway: object
    links: object

    def execute(self, *, workspace_id: str, conversation_id: int) -> tuple[Conversation, dict]:
        conversation = self.gateway.get_conversation(conversation_id)
        link_map = self.links.map_for(
            workspace_id=workspace_id, conversation_ids=[conversation_id]
        )
        return conversation, link_map.get(conversation_id, {})


@dataclass
class ListMessages:
    """Histórico da conversa. `before` pagina para trás (scroll infinito)."""

    gateway: object

    def execute(self, *, conversation_id: int, before: int | None = None) -> list[Message]:
        return self.gateway.list_messages(conversation_id, before=before)


@dataclass
class GetInboxCounts:
    """Contadores das pastas (minhas / não atribuídas / todas)."""

    gateway: object

    def execute(self) -> dict:
        return self.gateway.conversation_counts()


@dataclass
class LoadCatalog:
    """Carrega de uma vez tudo que a tela de atendimento precisa para montar.

    Caixas, agentes, times, etiquetas e respostas prontas mudam pouco; buscar
    em cinco requisições separadas do frontend deixaria a tela piscando.
    """

    gateway: object

    def execute(self) -> dict:
        return {
            "inboxes": self.gateway.list_inboxes(),
            "agents": self.gateway.list_agents(),
            "teams": self.gateway.list_teams(),
            "labels": self.gateway.list_labels(),
            "canned_responses": self.gateway.list_canned_responses(),
        }
