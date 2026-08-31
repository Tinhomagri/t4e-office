# mcp-server/server.py
"""MCP server remoto do t4e-office: cria/lista cards via a API HTTP existente.

Não guarda nenhuma credencial. Cada chamada MCP chega com o Bearer token
pessoal do usuário (gerado em Configurações -> Tokens de API no office); este
servidor só repassa esse header pra API Django, que autentica via
PersonalTokenAuthentication e aplica as capabilities normais do usuário.
"""

import os

import httpx
from mcp.server.fastmcp import Context, FastMCP

BASE_URL = os.environ.get("T4E_API_URL", "http://web:8000")

mcp = FastMCP("t4e-office", host="0.0.0.0", port=8000)


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
