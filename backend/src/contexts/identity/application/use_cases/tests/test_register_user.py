"""Testes do RegisterUser com repositório falso em memória (sem DB)."""
import pytest

from contexts.identity.application.use_cases.register_user import RegisterUser
from contexts.identity.domain.entities.user import User
from contexts.identity.domain.repositories.user_repository import UserRepository
from contexts.identity.domain.value_objects.email import Email
from shared.domain.errors import ConflictError, ValidationError


class FakeUserRepository(UserRepository):
    """Repositório em memória para testar regras sem tocar o banco."""

    def __init__(self):
        self._by_email: dict[str, User] = {}

    def exists_by_email(self, email: Email) -> bool:
        return str(email) in self._by_email

    def create(self, *, email: Email, full_name: str, raw_password: str) -> User:
        user = User(id="fake-1", email=email, full_name=full_name)
        self._by_email[str(email)] = user
        return user

    def get_by_email(self, email: Email) -> User | None:
        return self._by_email.get(str(email))


def test_registra_usuario_com_sucesso():
    use_case = RegisterUser(FakeUserRepository())
    result = use_case.execute(
        email="JOAO@t4e.com", full_name="João Silva", password="senha12345"
    )
    assert result.user_id == "fake-1"
    # email normalizado para minúsculo
    assert result.email == "joao@t4e.com"


def test_rejeita_email_duplicado():
    repo = FakeUserRepository()
    use_case = RegisterUser(repo)
    use_case.execute(email="a@t4e.com", full_name="A", password="senha12345")
    with pytest.raises(ConflictError):
        use_case.execute(email="a@t4e.com", full_name="B", password="senha12345")


def test_rejeita_email_invalido():
    use_case = RegisterUser(FakeUserRepository())
    with pytest.raises(ValidationError):
        use_case.execute(email="sem-arroba", full_name="X", password="senha12345")
