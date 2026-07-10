"""Caso de uso: login ou cadastro via Google OAuth."""
from dataclasses import dataclass

from contexts.identity.domain.repositories.user_repository import UserRepository
from contexts.identity.domain.value_objects.email import Email
from shared.domain.errors import ValidationError


@dataclass
class AuthenticateWithGoogleResult:
    """Resultado da autenticação Google — usuário + se acabou de ser criado."""

    user_id: str
    email: str
    full_name: str
    created: bool


class AuthenticateWithGoogle:
    """Encontra o usuário pelo email verificado do Google, ou cadastra um novo.

    Diferente do cadastro por senha: o email já vem verificado pelo Google,
    então o usuário nasce ativo e sem exigir confirmação por email.
    """

    def __init__(self, user_repository: UserRepository):
        self.user_repository = user_repository

    def execute(self, *, email: str, full_name: str) -> AuthenticateWithGoogleResult:
        if not email:
            raise ValidationError("O Google não retornou um email verificado.")

        email_vo = Email(email)
        existing = self.user_repository.get_by_email(email_vo)
        if existing:
            return AuthenticateWithGoogleResult(
                user_id=str(existing.id),
                email=str(existing.email),
                full_name=existing.full_name,
                created=False,
            )

        user = self.user_repository.create(
            email=email_vo,
            full_name=full_name or email.split("@")[0],
            raw_password=None,
            is_active=True,
        )
        return AuthenticateWithGoogleResult(
            user_id=str(user.id), email=str(user.email), full_name=user.full_name, created=True
        )
