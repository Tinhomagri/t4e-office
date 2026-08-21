import pytest
from rest_framework.test import APIClient

from contexts.identity.infrastructure.django.models import MembershipModel, UserModel, WorkspaceModel


@pytest.fixture
def user(db):
    return UserModel.objects.create_user(
        email="perfil@t4e.com", password="senha-atual-123", full_name="Perfil T4E", is_active=True
    )


@pytest.fixture
def client(user):
    api = APIClient()
    api.force_authenticate(user)
    return api


def test_profile_get_returns_extended_fields(client):
    response = client.get("/api/auth/me/")
    assert response.status_code == 200
    assert response.data["timezone"] == "America/Sao_Paulo"
    assert response.data["language"] == "pt-BR"
    assert response.data["has_usable_password"] is True


def test_profile_patch_updates_personal_and_preferences(client, user):
    response = client.patch("/api/auth/me/", {
        "job_title": "Product Designer", "phone": "+55 11 99999-9999",
        "bio": "Construindo produtos.", "location": "São Paulo, SP",
        "theme": "dark", "density": "compact", "availability": "focus",
        "notification_preferences": {"mentions": True, "meetings": False, "unknown": True},
    }, format="json")
    assert response.status_code == 200
    user.refresh_from_db()
    assert user.job_title == "Product Designer"
    assert user.notification_preferences == {"mentions": True, "meetings": False}


def test_profile_rejects_invalid_choice(client):
    response = client.patch("/api/auth/me/", {"theme": "neon"}, format="json")
    assert response.status_code == 400


def test_change_password_requires_current_password(client, user):
    wrong = client.post("/api/auth/me/change-password/", {
        "current_password": "errada", "new_password": "nova-senha-123"
    }, format="json")
    assert wrong.status_code == 400
    success = client.post("/api/auth/me/change-password/", {
        "current_password": "senha-atual-123", "new_password": "nova-senha-123"
    }, format="json")
    assert success.status_code == 200
    user.refresh_from_db()
    assert user.check_password("nova-senha-123")


def test_workspace_members_exposes_profile_photo(client, user):
    user.avatar_image = "data:image/webp;base64,foto"
    user.save(update_fields=["avatar_image"])
    workspace = WorkspaceModel.objects.create(name="T4E", slug="t4e-avatar", owner=user)
    MembershipModel.objects.create(workspace=workspace, user=user, role="owner")
    response = client.get(f"/api/auth/workspaces/{workspace.id}/members/")
    assert response.status_code == 200
    assert response.data[0]["avatar_url"] == "data:image/webp;base64,foto"
