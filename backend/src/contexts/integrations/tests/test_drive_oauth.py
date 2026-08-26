"""OAuth do Google Drive configurado pelo dono dentro do Office."""
from urllib.parse import parse_qs, urlparse
from unittest.mock import Mock, patch

import pytest
from rest_framework.test import APIClient

from contexts.identity.infrastructure.django.models import MembershipModel, UserModel, WorkspaceModel
from contexts.integrations.infrastructure.django.models import SocialOAuthStateModel


@pytest.fixture
def drive_owner(db):
    owner = UserModel.objects.create_user(
        email="drive-owner@t4e.com", password="x", full_name="Dono", is_active=True
    )
    workspace = WorkspaceModel.objects.create(name="Drive", slug="drive-oauth", owner=owner)
    MembershipModel.objects.create(workspace=workspace, user=owner, role="owner", allowed_spaces=None)
    client = APIClient()
    client.force_authenticate(user=owner)
    return client, workspace


@pytest.mark.django_db
def test_dono_salva_dados_do_app_sem_refresh_e_inicia_oauth(drive_owner, settings):
    client, workspace = drive_owner
    settings.DRIVE_OAUTH_REDIRECT_BASE = "https://api.office.t4e.com"
    payload = {
        "workspace_id": str(workspace.id),
        "client_id": "google-client-id",
        "client_secret": "google-client-secret",
        "takes_folder_id": "takes-folder",
        "projects_folder_id": "projects-folder",
    }

    saved = client.put("/api/integrations/drive/config/", payload, format="json")
    assert saved.status_code == 200, saved.data
    assert saved.data["configured"] is False
    assert saved.data["oauth_ready"] is True

    response = client.get(
        "/api/integrations/drive/oauth/url/", {"workspace_id": str(workspace.id)}
    )
    assert response.status_code == 200, response.data
    query = parse_qs(urlparse(response.data["url"]).query)
    assert query["client_id"] == ["google-client-id"]
    assert query["redirect_uri"] == [
        "https://api.office.t4e.com/api/integrations/drive/oauth/callback/"
    ]
    assert query["access_type"] == ["offline"]
    assert query["prompt"] == ["consent"]
    assert SocialOAuthStateModel.objects.filter(provider="google_drive").exists()


@pytest.mark.django_db
def test_callback_cifra_refresh_token_sem_devolve_lo_ao_navegador(drive_owner):
    client, workspace = drive_owner
    client.put(
        "/api/integrations/drive/config/",
        {
            "workspace_id": str(workspace.id),
            "client_id": "google-client-id",
            "client_secret": "google-client-secret",
            "takes_folder_id": "takes-folder",
            "projects_folder_id": "projects-folder",
        },
        format="json",
    )
    started = client.get(
        "/api/integrations/drive/oauth/url/", {"workspace_id": str(workspace.id)}
    )
    state = parse_qs(urlparse(started.data["url"]).query)["state"][0]
    token_response = Mock()
    token_response.json.return_value = {"refresh_token": "never-send-this-to-browser"}
    token_response.raise_for_status.return_value = None

    with patch(
        "contexts.integrations.interface.api.drive_config_views.httpx.post",
        return_value=token_response,
    ):
        callback = APIClient().get(
            "/api/integrations/drive/oauth/callback/", {"state": state, "code": "code"}
        )

    assert callback.status_code == 302
    assert callback["Location"].endswith("/app/marketing/biblioteca?drive=connected")
    status = client.get("/api/integrations/drive/config/", {"workspace_id": str(workspace.id)})
    assert status.data["configured"] is True
    assert "never-send-this-to-browser" not in str(status.data)
