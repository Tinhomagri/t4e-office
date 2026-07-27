"""Contatos do Chatwoot — a pessoa do outro lado da conversa."""
from __future__ import annotations

from dataclasses import dataclass

from contexts.chatwoot.domain.entities.catalog import ChatContact
from shared.domain.errors import ValidationError


@dataclass
class SearchContacts:
    """Busca por nome, e-mail, telefone ou identificador."""

    gateway: object

    def execute(self, *, query: str, page: int = 1) -> list[ChatContact]:
        if not query.strip():
            return self.gateway.list_contacts(page=page)
        return self.gateway.search_contacts(query.strip(), page=page)


@dataclass
class GetContact:
    """Ficha completa do contato para o painel lateral."""

    gateway: object

    def execute(self, *, contact_id: int) -> ChatContact:
        return self.gateway.get_contact(contact_id)


@dataclass
class UpdateContact:
    """Edita a ficha do contato direto do painel lateral.

    Só repassa as chaves que o Chatwoot aceita — mandar campo desconhecido faz
    a API devolver 422 e o usuário veria um erro sem sentido.
    """

    gateway: object

    ALLOWED = frozenset(
        {
            "name",
            "email",
            "phone_number",
            "identifier",
            "blocked",
            "avatar_url",
            "additional_attributes",
            "custom_attributes",
        }
    )

    def execute(self, *, contact_id: int, payload: dict) -> ChatContact:
        clean = {k: v for k, v in payload.items() if k in self.ALLOWED}
        if not clean:
            raise ValidationError("Nenhum campo editável foi enviado.")
        return self.gateway.update_contact(contact_id, clean)


@dataclass
class GetContactConversations:
    """Conversas anteriores do mesmo contato — contexto histórico do atendimento."""

    gateway: object

    def execute(self, *, contact_id: int) -> list:
        return self.gateway.contact_conversations(contact_id)
