"""Casos de uso de clientes e contatos."""
from contexts.sales.application.use_cases._access import assert_workspace_member
from contexts.sales.domain.entities.contact import Contact
from contexts.sales.domain.entities.customer import Customer, CustomerKind
from contexts.sales.domain.repositories.customer_repository import (
    ContactRepository,
    CustomerRepository,
    WorkspaceAccess,
)
from shared.domain.errors import NotFoundError


class CreateCustomer:
    """Cadastra um cliente no workspace."""

    def __init__(
        self,
        customer_repository: CustomerRepository,
        workspace_access: WorkspaceAccess,
    ):
        self.customer_repository = customer_repository
        self.workspace_access = workspace_access

    def execute(self, *, workspace_id: str, actor_id: str, **data) -> Customer:
        assert_workspace_member(
            self.workspace_access, workspace_id=workspace_id, actor_id=actor_id
        )
        return self.customer_repository.create(
            customer=Customer(
                id=None,
                workspace_id=workspace_id,
                name=data.get("name", ""),
                kind=CustomerKind(data.get("kind") or "company"),
                legal_name=data.get("legal_name", "") or "",
                document=data.get("document", "") or "",
                email=data.get("email", "") or "",
                phone=data.get("phone", "") or "",
                website=data.get("website", "") or "",
                notes=data.get("notes", "") or "",
                owner_id=data.get("owner_id") or actor_id,
            )
        )


class ListCustomers:
    """Lista os clientes de um workspace."""

    def __init__(
        self,
        customer_repository: CustomerRepository,
        workspace_access: WorkspaceAccess,
    ):
        self.customer_repository = customer_repository
        self.workspace_access = workspace_access

    def execute(
        self, *, workspace_id: str, actor_id: str, search: str = ""
    ) -> list[Customer]:
        assert_workspace_member(
            self.workspace_access, workspace_id=workspace_id, actor_id=actor_id
        )
        return self.customer_repository.list_by_workspace(
            workspace_id=workspace_id, search=search
        )


class GetCustomer:
    """Busca um cliente garantindo o acesso ao workspace dono."""

    def __init__(
        self,
        customer_repository: CustomerRepository,
        workspace_access: WorkspaceAccess,
    ):
        self.customer_repository = customer_repository
        self.workspace_access = workspace_access

    def execute(self, *, customer_id: str, actor_id: str) -> Customer:
        customer = self.customer_repository.get(customer_id=customer_id)
        if customer is None:
            raise NotFoundError("Cliente não encontrado.")
        assert_workspace_member(
            self.workspace_access,
            workspace_id=customer.workspace_id,
            actor_id=actor_id,
        )
        return customer


class UpdateCustomer:
    """Atualiza parcialmente os dados de um cliente."""

    _FIELDS = (
        "name", "legal_name", "document", "email",
        "phone", "website", "notes", "owner_id",
    )

    def __init__(
        self,
        customer_repository: CustomerRepository,
        workspace_access: WorkspaceAccess,
    ):
        self.customer_repository = customer_repository
        self.workspace_access = workspace_access

    def execute(self, *, customer_id: str, actor_id: str, **changes) -> Customer:
        customer = GetCustomer(
            self.customer_repository, self.workspace_access
        ).execute(customer_id=customer_id, actor_id=actor_id)
        if changes.get("kind"):
            customer.kind = CustomerKind(changes["kind"])
        for field in self._FIELDS:
            if changes.get(field) is not None:
                setattr(customer, field, changes[field])
        customer.__post_init__()
        return self.customer_repository.update(customer=customer)


class DeleteCustomer:
    """Remove um cliente e, em cascata, seus contatos e negócios."""

    def __init__(
        self,
        customer_repository: CustomerRepository,
        workspace_access: WorkspaceAccess,
    ):
        self.customer_repository = customer_repository
        self.workspace_access = workspace_access

    def execute(self, *, customer_id: str, actor_id: str) -> None:
        GetCustomer(self.customer_repository, self.workspace_access).execute(
            customer_id=customer_id, actor_id=actor_id
        )
        self.customer_repository.delete(customer_id=customer_id)


class ListContacts:
    """Lista os contatos de um cliente."""

    def __init__(
        self,
        contact_repository: ContactRepository,
        customer_repository: CustomerRepository,
        workspace_access: WorkspaceAccess,
    ):
        self.contact_repository = contact_repository
        self.customer_repository = customer_repository
        self.workspace_access = workspace_access

    def execute(self, *, customer_id: str, actor_id: str) -> list[Contact]:
        GetCustomer(self.customer_repository, self.workspace_access).execute(
            customer_id=customer_id, actor_id=actor_id
        )
        return self.contact_repository.list_by_customer(customer_id=customer_id)


class CreateContact:
    """Adiciona um contato a um cliente."""

    def __init__(
        self,
        contact_repository: ContactRepository,
        customer_repository: CustomerRepository,
        workspace_access: WorkspaceAccess,
    ):
        self.contact_repository = contact_repository
        self.customer_repository = customer_repository
        self.workspace_access = workspace_access

    def execute(self, *, customer_id: str, actor_id: str, **data) -> Contact:
        GetCustomer(self.customer_repository, self.workspace_access).execute(
            customer_id=customer_id, actor_id=actor_id
        )
        contact = self.contact_repository.create(
            contact=Contact(
                id=None,
                customer_id=customer_id,
                name=data.get("name", ""),
                role=data.get("role", "") or "",
                email=data.get("email", "") or "",
                phone=data.get("phone", "") or "",
                is_primary=bool(data.get("is_primary")),
            )
        )
        if contact.is_primary:
            # Só um contato principal por cliente
            self.contact_repository.clear_primary(
                customer_id=customer_id, except_id=contact.id
            )
        return contact


class UpdateContact:
    """Atualiza parcialmente um contato."""

    _FIELDS = ("name", "role", "email", "phone", "is_primary")

    def __init__(
        self,
        contact_repository: ContactRepository,
        customer_repository: CustomerRepository,
        workspace_access: WorkspaceAccess,
    ):
        self.contact_repository = contact_repository
        self.customer_repository = customer_repository
        self.workspace_access = workspace_access

    def _load(self, contact_id: str, actor_id: str) -> Contact:
        contact = self.contact_repository.get(contact_id=contact_id)
        if contact is None:
            raise NotFoundError("Contato não encontrado.")
        GetCustomer(self.customer_repository, self.workspace_access).execute(
            customer_id=contact.customer_id, actor_id=actor_id
        )
        return contact

    def execute(self, *, contact_id: str, actor_id: str, **changes) -> Contact:
        contact = self._load(contact_id, actor_id)
        for field in self._FIELDS:
            if changes.get(field) is not None:
                setattr(contact, field, changes[field])
        contact.__post_init__()
        updated = self.contact_repository.update(contact=contact)
        if updated.is_primary:
            self.contact_repository.clear_primary(
                customer_id=updated.customer_id, except_id=updated.id
            )
        return updated


class DeleteContact(UpdateContact):
    """Remove um contato de um cliente."""

    def execute(self, *, contact_id: str, actor_id: str, **_changes) -> None:
        self._load(contact_id, actor_id)
        self.contact_repository.delete(contact_id=contact_id)
