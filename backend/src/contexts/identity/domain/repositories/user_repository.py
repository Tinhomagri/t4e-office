"""Porta do repositório de usuários."""
from abc import ABC, abstractmethod

from contexts.identity.domain.entities.user import User
from contexts.identity.domain.value_objects.email import Email


class UserRepository(ABC):
    """Contrato de persistência de usuários."""

    @abstractmethod
    def exists_by_email(self, email: Email) -> bool:
        """Indica se já existe usuário com este email."""

    @abstractmethod
    def create(self, *, email: Email, full_name: str, raw_password: str) -> User:
        """Cria o usuário com a senha já hasheada pela infraestrutura."""

    @abstractmethod
    def get_by_email(self, email: Email) -> User | None:
        """Retorna o usuário pelo email, ou None."""
