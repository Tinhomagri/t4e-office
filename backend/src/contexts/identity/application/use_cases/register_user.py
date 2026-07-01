"""Caso de uso: cadastro de novo usuário."""
from dataclasses import dataclass

from contexts.identity.domain.repositories.user_repository import UserRepository
from contexts.identity.domain.value_objects.email import Email
from shared.domain.errors import ConflictError


@dataclass
class RegisterUserResult:
    """Resultado do cadastro."""

    user_id: str
    email: str
    full_name: str


class RegisterUser:
    """Cadastra um usuário garantindo email único."""

    def __init__(self, user_repository: UserRepository):
        # Recebe a porta, não a implementação concreta
        self.user_repository = user_repository

    def execute(
        self,
        *,
        email: str,
        full_name: str,
        password: str,
        is_active: bool = False,
    ) -> RegisterUserResult:
        email_vo = Email(email)
        if self.user_repository.exists_by_email(email_vo):
            raise ConflictError("Já existe uma conta com este email.")

        user = self.user_repository.create(
            email=email_vo,
            full_name=full_name,
            raw_password=password,
            is_active=is_active,
        )
        return RegisterUserResult(
            user_id=str(user.id), email=str(user.email), full_name=user.full_name
        )
