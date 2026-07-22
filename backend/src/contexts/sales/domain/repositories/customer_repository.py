"""Portas dos repositórios de cliente e contato."""
from abc import ABC, abstractmethod

from contexts.sales.domain.entities.contact import Contact
from contexts.sales.domain.entities.customer import Customer


class CustomerRepository(ABC):
    """Contrato de persistência de clientes."""

    @abstractmethod
    def create(self, *, customer: Customer) -> Customer:
        """Persiste um novo cliente."""

    @abstractmethod
    def get(self, *, customer_id: str) -> Customer | None:
        """Busca um cliente por id (ou None)."""

    @abstractmethod
    def list_by_workspace(self, *, workspace_id: str, search: str = "") -> list[Customer]:
        """Lista clientes de um workspace, filtrando por nome/documento."""

    @abstractmethod
    def update(self, *, customer: Customer) -> Customer:
        """Atualiza um cliente existente."""

    @abstractmethod
    def delete(self, *, customer_id: str) -> None:
        """Remove um cliente."""


class ContactRepository(ABC):
    """Contrato de persistência de contatos."""

    @abstractmethod
    def create(self, *, contact: Contact) -> Contact:
        """Persiste um novo contato."""

    @abstractmethod
    def get(self, *, contact_id: str) -> Contact | None:
        """Busca um contato por id (ou None)."""

    @abstractmethod
    def list_by_customer(self, *, customer_id: str) -> list[Contact]:
        """Lista contatos de um cliente."""

    @abstractmethod
    def update(self, *, contact: Contact) -> Contact:
        """Atualiza um contato existente."""

    @abstractmethod
    def clear_primary(self, *, customer_id: str, except_id: str | None = None) -> None:
        """Desmarca o contato principal dos demais contatos do cliente."""

    @abstractmethod
    def delete(self, *, contact_id: str) -> None:
        """Remove um contato."""


class WorkspaceAccess(ABC):
    """Porta para verificar acesso do usuário ao workspace (cross-context)."""

    @abstractmethod
    def is_member(self, *, workspace_id: str, user_id: str) -> bool:
        """Indica se o usuário é membro do workspace."""
