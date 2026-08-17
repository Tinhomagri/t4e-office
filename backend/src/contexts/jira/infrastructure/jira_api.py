"""Cliente HTTP da Jira Cloud REST API (v3 + Agile 1.0).

Autentica com Basic Auth (`email` + `api_token`), como documentado em
https://developer.atlassian.com/cloud/jira/platform/basic-auth-for-rest-apis/.
Erros de transporte/HTTP viram erros de domínio na borda, mesmo estilo de
`contexts/chatwoot/infrastructure/chatwoot_api.py`.
"""
from __future__ import annotations

import httpx

from shared.domain.errors import NotFoundError, PermissionDeniedError, UpstreamError

TIMEOUT = httpx.Timeout(30.0, connect=10.0)
PAGE_SIZE = 100


class JiraClient:
    def __init__(self, *, base_url: str, email: str, api_token: str):
        self._base = base_url.rstrip("/")
        self._auth = httpx.BasicAuth(email, api_token)
        self._headers = {"Accept": "application/json"}

    def _get(self, path: str, **params) -> dict:
        clean = {k: v for k, v in params.items() if v is not None}
        url = f"{self._base}{path}"
        try:
            resp = httpx.get(
                url, params=clean, auth=self._auth, headers=self._headers, timeout=TIMEOUT
            )
        except httpx.HTTPError as exc:
            raise UpstreamError(f"Não foi possível falar com o Jira: {exc}") from exc

        if resp.status_code in (401, 403):
            raise PermissionDeniedError(
                "O Jira recusou o token de acesso. Verifique JIRA_EMAIL/JIRA_API_TOKEN."
            )
        if resp.status_code == 404:
            raise NotFoundError(f"Recurso não encontrado no Jira: {path}")
        if resp.status_code >= 400:
            raise UpstreamError(f"Jira respondeu {resp.status_code}: {resp.text[:300]}")
        return resp.json() if resp.content else {}

    def verify(self) -> dict:
        return self._get("/rest/api/3/myself")

    def list_projects(self) -> list[dict]:
        return self._get("/rest/api/3/project/search", maxResults=200).get("values", [])

    def search_issues(
        self, *, jql: str, start_at: int = 0, max_results: int = PAGE_SIZE
    ) -> dict:
        return self._get(
            "/rest/api/3/search",
            jql=jql,
            startAt=start_at,
            maxResults=max_results,
            expand="changelog",
            fields="*all",
        )

    def list_comments(self, issue_key: str, *, start_at: int = 0) -> dict:
        return self._get(
            f"/rest/api/3/issue/{issue_key}/comment",
            startAt=start_at,
            maxResults=PAGE_SIZE,
        )

    def find_field_id(self, name: str) -> str | None:
        fields = self._get("/rest/api/3/field")
        needle = name.strip().lower()
        for field in fields if isinstance(fields, list) else []:
            if (field.get("name") or "").strip().lower() == needle:
                return field.get("id")
        return None

    def list_boards(self, project_key: str) -> list[dict]:
        return self._get(
            "/rest/agile/1.0/board", projectKeyOrId=project_key, maxResults=50
        ).get("values", [])

    def list_sprints(self, board_id: int) -> list[dict]:
        sprints: list[dict] = []
        start_at = 0
        while True:
            page = self._get(
                f"/rest/agile/1.0/board/{board_id}/sprint",
                startAt=start_at,
                maxResults=PAGE_SIZE,
            )
            values = page.get("values", [])
            sprints.extend(values)
            if page.get("isLast", True) or not values:
                break
            start_at += len(values)
        return sprints
