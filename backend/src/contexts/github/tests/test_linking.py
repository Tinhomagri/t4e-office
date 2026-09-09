"""Testes do vínculo GitHub↔card: parsing de refs, push e pull_request."""
import httpx
import pytest
from cryptography.fernet import Fernet
from django.test import override_settings

from contexts.github.infrastructure import linking
from contexts.github.infrastructure.django.models import (
    CardDevLinkModel,
    GithubConnectionModel,
    GithubRepoLinkModel,
)
from contexts.identity.infrastructure.django.models import (
    MembershipModel,
    UserModel,
    WorkspaceModel,
)
from contexts.projects.infrastructure.django.models import CardModel, ProjectModel


@pytest.fixture
def scenario(db):
    owner = UserModel.objects.create_user(
        email="o@t4e.com", password="x", full_name="O", is_active=True
    )
    ws = WorkspaceModel.objects.create(name="WS", slug="ws", owner=owner)
    MembershipModel.objects.create(workspace=ws, user=owner, role="owner")
    project = ProjectModel.objects.create(workspace=ws, name="Proj", key="PRJ")
    card = CardModel.objects.create(project=project, number=7, title="Login SSO")
    repo = GithubRepoLinkModel.objects.create(
        project_id=project.id, workspace_id=ws.id, full_name="acme/app"
    )
    return {"project": project, "card": card, "repo": repo}


def test_find_cards_por_ref(scenario):
    cards = linking.find_cards(str(scenario["project"].id), "Fix bug PRJ-7 no login")
    assert [c.number for c in cards] == [7]
    # Chave errada não casa.
    assert linking.find_cards(str(scenario["project"].id), "OTHER-7") == []


def test_branch_name_slug(scenario):
    name = linking.branch_name_for(scenario["card"], "PRJ")
    assert name == "PRJ-7-login-sso"


def test_handle_push_liga_commit_e_branch(scenario):
    payload = {
        "ref": "refs/heads/PRJ-7-login-sso",
        "commits": [
            {"id": "abc123", "message": "PRJ-7 implementa SSO", "url": "http://c", "author": {"username": "dev"}}
        ],
    }
    n = linking.handle_push(scenario["repo"], payload)
    assert n == 2  # 1 commit + 1 branch
    assert CardDevLinkModel.objects.filter(card_id=scenario["card"].id, kind="commit").exists()
    assert CardDevLinkModel.objects.filter(card_id=scenario["card"].id, kind="branch").exists()


def test_handle_pull_request_liga_pr(scenario):
    payload = {
        "pull_request": {
            "number": 42,
            "title": "PRJ-7 Login por SSO",
            "html_url": "http://pr/42",
            "state": "open",
            "merged": False,
            "head": {"ref": "PRJ-7-login-sso"},
            "user": {"login": "dev", "avatar_url": "http://a"},
        }
    }
    n = linking.handle_pull_request(scenario["repo"], payload)
    assert n == 1
    link = CardDevLinkModel.objects.get(card_id=scenario["card"].id, kind="pull_request")
    assert link.number == 42
    assert link.state == "open"


def test_project_dev_metrics_endpoint(scenario):
    from rest_framework.test import APIClient

    linking.handle_pull_request(
        scenario["repo"],
        {
            "pull_request": {
                "number": 5,
                "title": "PRJ-7 SSO",
                "html_url": "http://pr/5",
                "state": "open",
                "merged": False,
                "head": {"ref": "PRJ-7-x"},
                "user": {"login": "dev", "avatar_url": ""},
            }
        },
    )
    owner = scenario["project"].workspace.owner
    client = APIClient()
    client.force_authenticate(user=owner)
    resp = client.get(f"/api/github/projects/{scenario['project'].id}/dev/")
    assert resp.status_code == 200
    data = resp.json()
    assert data["prs"]["open"] == 1
    assert data["repos"][0]["full_name"] == "acme/app"
    assert len(data["recent_prs"]) == 1


def test_status_revoga_conexao_quando_token_nao_pode_ser_decifrado(scenario):
    """Uma troca da chave Fernet não pode deixar a UI presa em 'conectado'."""
    from rest_framework.test import APIClient

    owner = scenario["project"].workspace.owner
    old_key = Fernet.generate_key().decode()
    new_key = Fernet.generate_key().decode()
    encrypted_token = Fernet(old_key.encode()).encrypt(b"github-token").decode()
    connection = GithubConnectionModel.objects.create(
        user=owner,
        github_login="octocat",
        access_token=encrypted_token,
        status="active",
    )
    client = APIClient()
    client.force_authenticate(user=owner)

    with override_settings(GITHUB_TOKEN_ENC_KEY=new_key):
        response = client.get("/api/github/status/")

    assert response.status_code == 200
    assert response.json() == {"connected": False, "reason": "reconnect_required"}
    connection.refresh_from_db()
    assert connection.status == "revoked"


def test_repos_pede_reconexao_quando_github_recusa_token(scenario, monkeypatch):
    """Token revogado no GitHub deve virar recuperação, não erro 500."""
    from rest_framework.test import APIClient

    owner = scenario["project"].workspace.owner
    key = Fernet.generate_key().decode()
    encrypted_token = Fernet(key.encode()).encrypt(b"revoked-token").decode()
    connection = GithubConnectionModel.objects.create(
        user=owner,
        github_login="octocat",
        access_token=encrypted_token,
        status="active",
    )
    github_request = httpx.Request("GET", "https://api.github.com/user/repos")
    github_response = httpx.Response(
        401,
        request=github_request,
        json={"message": "Bad credentials"},
    )
    monkeypatch.setattr(httpx, "get", lambda *args, **kwargs: github_response)

    client = APIClient()
    client.raise_request_exception = False
    client.force_authenticate(user=owner)
    with override_settings(GITHUB_TOKEN_ENC_KEY=key):
        response = client.get("/api/github/repos/")

    assert response.status_code == 400
    assert response.json() == {
        "error": "Sua conexão com o GitHub expirou. Conecte novamente."
    }
    connection.refresh_from_db()
    assert connection.status == "revoked"


def test_owner_pode_vincular_repositorio_ao_projeto(scenario, monkeypatch):
    """O vínculo não pode quebrar ao verificar a permissão administrativa."""
    from rest_framework.test import APIClient

    owner = scenario["project"].workspace.owner
    key = Fernet.generate_key().decode()
    encrypted_token = Fernet(key.encode()).encrypt(b"valid-token").decode()
    GithubConnectionModel.objects.create(
        user=owner,
        github_login="octocat",
        access_token=encrypted_token,
        status="active",
    )
    monkeypatch.setattr(
        "contexts.github.infrastructure.github_api.GithubClient.get_repo",
        lambda _client, full_name: {
            "full_name": full_name,
            "default_branch": "main",
        },
    )

    client = APIClient()
    client.raise_request_exception = False
    client.force_authenticate(user=owner)
    with override_settings(
        GITHUB_TOKEN_ENC_KEY=key,
        GITHUB_WEBHOOK_CALLBACK_URL="",
    ):
        response = client.post(
            f"/api/github/projects/{scenario['project'].id}/repos/",
            {"full_name": "acme/new-app"},
            format="json",
        )

    assert response.status_code == 201
    assert response.json()["full_name"] == "acme/new-app"
    assert GithubRepoLinkModel.objects.filter(
        project_id=scenario["project"].id,
        full_name="acme/new-app",
        connected_by=owner,
    ).exists()


def test_vinculo_usa_url_publica_do_app_quando_callback_nao_foi_configurado(
    scenario, monkeypatch
):
    """Deploy sem env explícita ainda deve registrar o webhook no próprio backend."""
    from rest_framework.test import APIClient

    owner = scenario["project"].workspace.owner
    key = Fernet.generate_key().decode()
    encrypted_token = Fernet(key.encode()).encrypt(b"valid-token").decode()
    GithubConnectionModel.objects.create(
        user=owner,
        github_login="octocat",
        access_token=encrypted_token,
        status="active",
    )
    monkeypatch.setattr(
        "contexts.github.infrastructure.github_api.GithubClient.get_repo",
        lambda _client, full_name: {
            "full_name": full_name,
            "default_branch": "main",
        },
    )
    received = {}

    def create_webhook(_client, full_name, *, callback_url, secret):
        received.update(
            full_name=full_name,
            callback_url=callback_url,
            secret=secret,
        )
        return {"id": 987}

    monkeypatch.setattr(
        "contexts.github.infrastructure.github_api.GithubClient.create_webhook",
        create_webhook,
    )

    client = APIClient()
    client.force_authenticate(user=owner)
    with override_settings(
        GITHUB_TOKEN_ENC_KEY=key,
        GITHUB_WEBHOOK_CALLBACK_URL="",
        FRONTEND_URL="https://office.example/",
    ):
        response = client.post(
            f"/api/github/projects/{scenario['project'].id}/repos/",
            {"full_name": "acme/new-app"},
            format="json",
        )

    assert response.status_code == 201
    assert response.json()["webhook_active"] is True
    assert received["full_name"] == "acme/new-app"
    assert received["callback_url"] == "https://office.example/api/github/webhook/"
    assert received["secret"]


def test_verify_signature():
    import hashlib
    import hmac

    body = b'{"a":1}'
    secret = "s3cr3t"
    sig = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    assert linking.verify_signature(secret=secret, body=body, signature=sig)
    assert not linking.verify_signature(secret=secret, body=body, signature="sha256=bad")
