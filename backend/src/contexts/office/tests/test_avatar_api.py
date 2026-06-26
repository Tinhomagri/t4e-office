import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from contexts.identity.infrastructure.django.models import UserModel


@pytest.fixture
def user(db):
    return UserModel.objects.create_user(
        email="dev@t4e.com", full_name="Dev T4E", password="senha123"
    )


@pytest.fixture
def auth_client(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def test_get_avatar_creates_profile_on_first_call(auth_client):
    url = reverse("office:avatar")
    response = auth_client.get(url)
    assert response.status_code == 200
    assert response.data["configured"] is False
    assert response.data["skin"] == 0


def test_patch_avatar_updates_and_marks_configured(auth_client):
    url = reverse("office:avatar")
    response = auth_client.patch(url, {"skin": 2, "cloth": 3, "hair": 1, "accessory": 0})
    assert response.status_code == 200
    assert response.data["skin"] == 2
    assert response.data["cloth"] == 3
    assert response.data["configured"] is True


def test_avatar_requires_auth():
    client = APIClient()
    url = reverse("office:avatar")
    response = client.get(url)
    assert response.status_code == 401
