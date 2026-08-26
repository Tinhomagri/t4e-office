"""Credenciais sociais: administrador de Marketing configura sem lê-las."""
import pytest
from rest_framework.test import APIClient

from contexts.copilot.infrastructure.django.models import SocialAccountModel
from contexts.identity.infrastructure.django.models import MembershipModel, UserModel, WorkspaceModel


@pytest.fixture
def marketing_admin(db):
    owner = UserModel.objects.create_user(
        email="owner-social@t4e.com", password="x", full_name="Dono", is_active=True
    )
    admin = UserModel.objects.create_user(
        email="admin-social@t4e.com", password="x", full_name="Admin", is_active=True
    )
    workspace = WorkspaceModel.objects.create(name="Social", slug="social-credentials", owner=owner)
    MembershipModel.objects.create(workspace=workspace, user=owner, role="owner", allowed_spaces=None)
    MembershipModel.objects.create(
        workspace=workspace, user=admin, role="admin", allowed_spaces=["marketing"]
    )
    client = APIClient()
    client.force_authenticate(user=admin)
    return client, workspace


@pytest.mark.django_db
def test_admin_marketing_salva_e_ve_apenas_dicas_mascaradas(marketing_admin):
    client, workspace = marketing_admin
    url = "/api/integrations/oauth/credentials/linkedin/"

    saved = client.put(
        url,
        {
            "workspace_id": str(workspace.id),
            "client_id": "linkedin-client-id",
            "client_secret": "linkedin-client-secret",
        },
        format="json",
    )
    listed = client.get(
        "/api/integrations/oauth/credentials/", {"workspace_id": str(workspace.id)}
    )
    connect = client.get(
        "/api/integrations/oauth/linkedin/url/", {"workspace_id": str(workspace.id)}
    )

    assert saved.status_code == 200, saved.data
    assert listed.status_code == 200
    credential = listed.data["providers"]["linkedin"]
    assert credential["has_client_id"] is True
    assert credential["client_id_hint"] == "••••t-id"
    assert "client_id" not in credential
    assert "linkedin-client-secret" not in str(listed.data)
    assert connect.status_code == 200


@pytest.mark.django_db
def test_admin_marketing_conecta_instagram_com_token_gerado_na_meta(marketing_admin, monkeypatch):
    client, workspace = marketing_admin

    monkeypatch.setattr(
        "contexts.integrations.interface.api.oauth_views.social_oauth.fetch_account_info",
        lambda provider, token: {"external_id": "17841416137684403", "account_name": "@t4egroup"},
    )
    response = client.post(
        "/api/integrations/oauth/instagram/token/",
        {"workspace_id": str(workspace.id), "access_token": "meta-generated-token"},
        format="json",
    )

    assert response.status_code == 201, response.data
    account = SocialAccountModel.objects.get(workspace=workspace, channel="instagram")
    assert account.account_name == "@t4egroup"
    assert account.access_token_encrypted != "meta-generated-token"
