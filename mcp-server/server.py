# mcp-server/server.py
"""MCP server remoto do t4e-office: cria/lista cards via a API HTTP existente.

Não guarda nenhuma credencial. Cada chamada MCP chega com o Bearer token
pessoal do usuário (gerado em Configurações -> Tokens de API no office); este
servidor só repassa esse header pra API Django, que autentica via
PersonalTokenAuthentication e aplica as capabilities normais do usuário.
"""

import os
import secrets
from urllib.parse import quote

import httpx
from mcp.server.auth.settings import AuthSettings, ClientRegistrationOptions, RevocationOptions
from mcp.server.fastmcp import Context, FastMCP
from starlette.requests import Request
from starlette.responses import RedirectResponse

from oauth_provider import OFFICE_BASE_URL, T4EOAuthProvider

BASE_URL = os.environ.get("T4E_API_URL", "http://web:8000")
MCP_PUBLIC_URL = os.environ.get("MCP_PUBLIC_URL", "https://mcp.t4egroup.com.br")

_provider = T4EOAuthProvider()

mcp = FastMCP(
    "t4e-office",
    host="0.0.0.0",
    port=8000,
    auth_server_provider=_provider,
    auth=AuthSettings(
        issuer_url=MCP_PUBLIC_URL,
        resource_server_url=MCP_PUBLIC_URL,
        client_registration_options=ClientRegistrationOptions(enabled=True),
        revocation_options=RevocationOptions(enabled=True),
    ),
)


@mcp.custom_route("/oauth/django-callback", methods=["GET"])
async def django_callback(request: Request):
    django_code = request.query_params.get("code")
    state = request.query_params.get("state")
    pending = _provider.pop_pending(state) if state else None
    if not django_code or pending is None:
        return RedirectResponse(url=f"{OFFICE_BASE_URL}/oauth/consent?error=invalid_state", status_code=302)
    mcp_code = secrets.token_urlsafe(32)
    params = pending["params"]
    _provider.store_mcp_code(mcp_code, django_code, pending["client_id"], params)
    redirect = str(params.redirect_uri)
    sep = "&" if "?" in redirect else "?"
    dest = f"{redirect}{sep}code={mcp_code}"
    if params.state:
        # state é opaco e definido pelo client (Claude) — escapa antes de
        # concatenar, mesmo sendo devolvido pro próprio client que o mandou.
        dest += f"&state={quote(params.state, safe='')}"
    return RedirectResponse(url=dest, status_code=302)


def _bearer_from(ctx: Context) -> str:
    request = ctx.request_context.request
    header = request.headers.get("authorization", "") if request else ""
    if not header.startswith("Bearer "):
        raise ValueError("Requisição sem token de autenticação (Authorization: Bearer <token>).")
    return header


def _request(ctx: Context, method: str, path: str, **kwargs) -> dict:
    headers = kwargs.pop("headers", {})
    headers["Authorization"] = _bearer_from(ctx)
    # A requisição que chega aqui já veio via HTTPS até o Traefik (mcp.t4egroup.com.br);
    # daqui pro `web` é rede interna do Docker, sem TLS. Sem este header o Django
    # (SECURE_SSL_REDIRECT + SECURE_PROXY_SSL_HEADER) acha que é HTTP inseguro e
    # devolve 301 pra https://web:8000, que não existe (web não serve TLS interno).
    headers["X-Forwarded-Proto"] = "https"
    r = httpx.request(method, f"{BASE_URL}{path}", headers=headers, timeout=15, **kwargs)
    try:
        r.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise httpx.HTTPStatusError(
            f"{exc}\nResposta do backend: {r.text}", request=exc.request, response=exc.response
        ) from exc
    return r.json() if r.content else {}


@mcp.tool()
def list_workspaces(ctx: Context) -> list[dict]:
    """Lista os workspaces do usuário autenticado (id, name, slug)."""
    me = _request(ctx, "GET", "/api/auth/me/")
    return me.get("workspaces", [])


@mcp.tool()
def list_projects(workspace_id: str, ctx: Context) -> list[dict]:
    """Lista projetos de um workspace (retorna id, name, key)."""
    return _request(ctx, "GET", "/api/projects/", params={"workspace_id": workspace_id})


@mcp.tool()
def list_documents(workspace_id: str, project_id: str, ctx: Context) -> list[dict]:
    """Lista os documentos brutos anexados a um projeto (sem análise de IA).

    workspace_id: id do workspace (obtido via list_workspaces).
    project_id: id do projeto (obtido via list_projects).
    Usa o resultado pra escolher qual documento ler com read_document.
    """
    return _request(
        ctx, "GET", "/api/copilot/documents/", params={"workspace_id": workspace_id, "project_id": project_id}
    )


@mcp.tool()
def read_document(document_id: str, ctx: Context) -> dict:
    """Lê o texto completo de um documento anexado a um projeto (obtido via list_documents).

    Usa pra entender o conteúdo do documento e decidir quais cards criar com create_card.
    """
    return _request(ctx, "GET", f"/api/copilot/documents/{document_id}/")


@mcp.tool()
def create_card(
    project_id: str,
    title: str,
    description: str = "",
    status: str = "todo",
    type: str = "feature",
    priority: str = "medium",
    labels: list[str] | None = None,
    ctx: Context = None,
) -> dict:
    """Cria um card em um projeto do t4e-office.

    project_id: id do projeto (obtido via list_projects).
    status: slug livre, ex. "todo", "in_progress", "done".
    type: "feature", "bug", "task", etc conforme choices do sistema.
    priority: "low", "medium", "high", etc.
    """
    payload = {
        "title": title,
        "description": description,
        "status": status,
        "type": type,
        "priority": priority,
        "labels": labels or [],
    }
    return _request(ctx, "POST", f"/api/projects/{project_id}/cards/", json=payload)


if __name__ == "__main__":
    mcp.run(transport="streamable-http")
