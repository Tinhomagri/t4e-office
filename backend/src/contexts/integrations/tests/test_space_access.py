"""Testes da SpaceAccessPermission: gating das views de integrations ao space
"marketing" (posts agendados). Um endpoint representativo (PostsView) basta —
todas as views do contexto usam o mesmo padrão de `permission_classes`.
"""
import pytest
from rest_framework.test import APIClient

from contexts.identity.infrastructure.django.models import (
    MembershipModel,
    UserModel,
    WorkspaceModel,
)


@pytest.fixture
def scenario(db):
    owner = UserModel.objects.create_user(
        email="owner@t4e.com", password="x", full_name="Owner", is_active=True
    )
    marketing_member = UserModel.objects.create_user(
        email="marketing@t4e.com", password="x", full_name="Marketing", is_active=True
    )
    restricted_member = UserModel.objects.create_user(
        email="boards@t4e.com", password="x", full_name="Boards Only", is_active=True
    )

    ws = WorkspaceModel.objects.create(name="WS", slug="ws-integrations-space", owner=owner)
    MembershipModel.objects.create(workspace=ws, user=owner, role="owner", allowed_spaces=None)
    MembershipModel.objects.create(
        workspace=ws, user=marketing_member, role="member", allowed_spaces=["marketing"]
    )
    MembershipModel.objects.create(
        workspace=ws, user=restricted_member, role="member", allowed_spaces=["boards"]
    )

    owner_client = APIClient()
    owner_client.force_authenticate(user=owner)
    marketing_client = APIClient()
    marketing_client.force_authenticate(user=marketing_member)
    restricted_client = APIClient()
    restricted_client.force_authenticate(user=restricted_member)

    return {
        "workspace": ws,
        "owner_client": owner_client,
        "marketing_client": marketing_client,
        "restricted_client": restricted_client,
    }


def test_posts_unrestricted_member_can_access(scenario):
    resp = scenario["owner_client"].get(
        "/api/integrations/posts/", {"workspace_id": str(scenario["workspace"].id)}
    )
    assert resp.status_code == 200, resp.data


def test_posts_marketing_member_can_access(scenario):
    resp = scenario["marketing_client"].get(
        "/api/integrations/posts/", {"workspace_id": str(scenario["workspace"].id)}
    )
    assert resp.status_code == 200, resp.data


def test_posts_restricted_member_denied(scenario):
    resp = scenario["restricted_client"].get(
        "/api/integrations/posts/", {"workspace_id": str(scenario["workspace"].id)}
    )
    assert resp.status_code == 403, resp.data
