import pytest

from contexts.identity.infrastructure.django.models import PersonalAccessToken, UserModel


@pytest.fixture
def user(db):
    return UserModel.objects.create_user(
        email="pat@t4e.com", password="senha-123", full_name="PAT User", is_active=True
    )


def test_personal_access_token_defaults_to_not_revoked(user):
    token = PersonalAccessToken.objects.create(user=user, token_hash="a" * 64)
    assert token.revoked_at is None
    assert token.last_used_at is None
    assert token.name == ""


def test_personal_access_token_hash_is_unique(user):
    PersonalAccessToken.objects.create(user=user, token_hash="b" * 64)
    with pytest.raises(Exception):
        PersonalAccessToken.objects.create(user=user, token_hash="b" * 64)
