"""Testes da SpaceAccessPermission: gating das views de integrations ao space
"marketing" (posts agendados). Um endpoint representativo (PostsView) basta
para as views cujo workspace_id chega via query_params/request.data — mas
PostDetailView e PostPublishView só descobrem o workspace_id DEPOIS de
buscar o post pelo id, então SpaceAccessPermission (que roda antes do corpo
da view) não pega esse caso — por isso o gate ali é reforçado com
`require_space(...)` chamado explicitamente após o fetch (ver views.py).
Os testes abaixo cobrem esse caminho separadamente.
"""
from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from contexts.copilot.infrastructure.django.models import SocialAccountModel
from contexts.github.infrastructure.django.crypto import encrypt
from contexts.identity.infrastructure.django.models import (
    MembershipModel,
    UserModel,
    WorkspaceModel,
)
from contexts.integrations.infrastructure.django.models import ScheduledPostModel


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


# ── PostDetailView / PostPublishView — workspace_id só existe pós-fetch ────

def _make_post(scenario, **overrides) -> ScheduledPostModel:
    account = SocialAccountModel.objects.create(
        workspace=scenario["workspace"],
        channel="instagram",
        account_name="@t4e",
        access_token_encrypted=encrypt("fake-token"),
    )
    fields = {
        "workspace": scenario["workspace"],
        "account": account,
        "content": "Post de teste",
        "media_url": "https://cdn.t4e.com/img.jpg",
        "scheduled_at": timezone.now() + timedelta(hours=1),
    }
    fields.update(overrides)
    return ScheduledPostModel.objects.create(**fields)


def test_patch_post_restricted_member_denied_even_though_member(scenario):
    """Membro do workspace, post existe nesse workspace, mas sem o space
    "marketing" — PATCH não envia workspace_id no corpo (URL só tem o id do
    post), então só o require_space pós-fetch pega esse caso."""
    post = _make_post(scenario)
    resp = scenario["restricted_client"].patch(
        f"/api/integrations/posts/{post.id}/", {"content": "Editado"}, format="json"
    )
    assert resp.status_code == 403, resp.data


def test_patch_post_marketing_member_can_edit(scenario):
    post = _make_post(scenario)
    resp = scenario["marketing_client"].patch(
        f"/api/integrations/posts/{post.id}/", {"content": "Editado"}, format="json"
    )
    assert resp.status_code == 200, resp.data


def test_patch_post_unrestricted_member_can_edit(scenario):
    post = _make_post(scenario)
    resp = scenario["owner_client"].patch(
        f"/api/integrations/posts/{post.id}/", {"content": "Editado"}, format="json"
    )
    assert resp.status_code == 200, resp.data


def test_delete_post_restricted_member_denied(scenario):
    post = _make_post(scenario)
    resp = scenario["restricted_client"].delete(f"/api/integrations/posts/{post.id}/")
    assert resp.status_code == 403, resp.data
    assert ScheduledPostModel.objects.filter(id=post.id).exists()


def test_delete_post_marketing_member_can_delete(scenario):
    post = _make_post(scenario)
    resp = scenario["marketing_client"].delete(f"/api/integrations/posts/{post.id}/")
    assert resp.status_code == 204, resp.data


def test_publish_post_restricted_member_denied(scenario, settings):
    settings.SOCIAL_SIMULATE = True
    post = _make_post(scenario)
    resp = scenario["restricted_client"].post(f"/api/integrations/posts/{post.id}/publish/")
    assert resp.status_code == 403, resp.data
    post.refresh_from_db()
    assert post.status != "published"


def test_publish_post_marketing_member_can_publish(scenario, settings):
    settings.SOCIAL_SIMULATE = True
    post = _make_post(scenario)
    resp = scenario["marketing_client"].post(f"/api/integrations/posts/{post.id}/publish/")
    assert resp.status_code == 200, resp.data
