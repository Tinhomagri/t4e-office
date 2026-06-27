"""Porta do repositório de convites."""
from abc import ABC, abstractmethod

from contexts.identity.domain.entities.invitation import Invitation


class InvitationRepository(ABC):
    """Contrato de persistência de convites."""

    @abstractmethod
    def create(self, *, invitation: Invitation) -> Invitation:
        """Persiste um novo convite."""

    @abstractmethod
    def get(self, *, invitation_id: str) -> Invitation | None:
        """Busca um convite por id."""

    @abstractmethod
    def get_by_token(self, *, token: str) -> Invitation | None:
        """Busca um convite por token."""

    @abstractmethod
    def list_by_workspace(self, *, workspace_id: str) -> list[Invitation]:
        """Lista convites de um workspace."""

    @abstractmethod
    def save(self, *, invitation: Invitation) -> Invitation:
        """Persiste alterações de status do convite."""

    @abstractmethod
    def pending_exists(self, *, workspace_id: str, email: str) -> bool:
        """Indica se já há convite pendente para o email no workspace."""
