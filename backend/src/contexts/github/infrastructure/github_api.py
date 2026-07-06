"""Cliente fino da API REST do GitHub (OAuth Web Application Flow).

Doc: https://docs.github.com/en/rest — usamos só os endpoints necessários para
o MVP: trocar code→token, ler o usuário, listar repos, criar branch, registrar
webhook e ler PRs/commits.
"""
from __future__ import annotations

import httpx
from django.conf import settings

API = "https://api.github.com"
OAUTH_AUTHORIZE = "https://github.com/login/oauth/authorize"
OAUTH_TOKEN = "https://github.com/login/oauth/access_token"

# Escopos: repo (ler/escrever refs + webhooks) e read:user (identidade).
SCOPES = "repo read:user"


def authorize_url(*, state: str) -> str:
    from urllib.parse import urlencode

    params = {
        "client_id": settings.GITHUB_OAUTH_CLIENT_ID,
        "redirect_uri": settings.GITHUB_OAUTH_REDIRECT_URI,
        "scope": SCOPES,
        "state": state,
    }
    return f"{OAUTH_AUTHORIZE}?{urlencode(params)}"


def exchange_code(code: str) -> dict:
    """Troca o `code` do callback pelo access_token."""
    resp = httpx.post(
        OAUTH_TOKEN,
        headers={"Accept": "application/json"},
        data={
            "client_id": settings.GITHUB_OAUTH_CLIENT_ID,
            "client_secret": settings.GITHUB_OAUTH_CLIENT_SECRET,
            "code": code,
            "redirect_uri": settings.GITHUB_OAUTH_REDIRECT_URI,
        },
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()


class GithubClient:
    """Chamadas autenticadas com o token OAuth de um usuário."""

    def __init__(self, token: str):
        self._headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }

    def _get(self, path: str, **params):
        r = httpx.get(f"{API}{path}", headers=self._headers, params=params, timeout=20)
        r.raise_for_status()
        return r.json()

    def _post(self, path: str, json: dict):
        r = httpx.post(f"{API}{path}", headers=self._headers, json=json, timeout=20)
        r.raise_for_status()
        return r.json()

    def me(self) -> dict:
        return self._get("/user")

    def list_repos(self) -> list[dict]:
        """Repos onde o usuário pode administrar (push/admin) — p/ escolher qual vincular."""
        repos: list[dict] = []
        for page in range(1, 4):  # até 300 repos (suficiente p/ MVP)
            batch = self._get(
                "/user/repos", per_page=100, page=page, sort="updated", affiliation="owner,collaborator,organization_member"
            )
            repos.extend(batch)
            if len(batch) < 100:
                break
        return [
            {
                "full_name": r["full_name"],
                "private": r["private"],
                "default_branch": r.get("default_branch", "main"),
                "admin": r.get("permissions", {}).get("admin", False),
                "push": r.get("permissions", {}).get("push", False),
            }
            for r in repos
        ]

    def get_repo(self, full_name: str) -> dict:
        return self._get(f"/repos/{full_name}")

    def branch_sha(self, full_name: str, branch: str) -> str:
        ref = self._get(f"/repos/{full_name}/git/ref/heads/{branch}")
        return ref["object"]["sha"]

    def create_branch(self, full_name: str, new_branch: str, from_sha: str) -> dict:
        """Cria uma branch (git ref) apontando para `from_sha`."""
        return self._post(
            f"/repos/{full_name}/git/refs",
            {"ref": f"refs/heads/{new_branch}", "sha": from_sha},
        )

    def create_webhook(self, full_name: str, *, callback_url: str, secret: str) -> dict:
        return self._post(
            f"/repos/{full_name}/hooks",
            {
                "name": "web",
                "active": True,
                "events": ["push", "pull_request"],
                "config": {
                    "url": callback_url,
                    "content_type": "json",
                    "secret": secret,
                    "insecure_ssl": "0",
                },
            },
        )

    def list_pulls(self, full_name: str, *, state: str = "all") -> list[dict]:
        return self._get(f"/repos/{full_name}/pulls", state=state, per_page=50)
