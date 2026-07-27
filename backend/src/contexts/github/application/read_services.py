"""Leituras agregadas do contexto github, sem passar pela camada HTTP.

Extraído de `interface/api/views.py` para que dois consumidores compartilhem a
mesma consulta: o endpoint `/api/github/projects/<id>/dev/` e as ferramentas
`gh_*` do Copiloto. Só lê o que os webhooks já gravaram — nenhuma chamada à API
do GitHub acontece aqui, então serve bem dentro do loop do agente.

Estas funções **não** checam acesso: quem chama já resolveu o projeto e a
permissão (a view via `_project_or_403`, o agente via registry do workspace).
"""
from __future__ import annotations

from contexts.github.infrastructure.django.models import (
    CardDevLinkModel,
    GithubRepoLinkModel,
)


def _link_dict(link: CardDevLinkModel) -> dict:
    return {
        "id": str(link.id),
        "title": link.title,
        "url": link.url,
        "state": link.state,
        "number": link.number,
        "branch": link.branch,
        "author_login": link.author_login,
        "author_avatar": link.author_avatar,
        "updated_at": link.updated_at.isoformat(),
    }


def project_dev_metrics(project_id: str, *, recent_limit: int = 15) -> dict:
    """Repos vinculados, contagem de PRs por estado e os PRs mais recentes."""
    repos = GithubRepoLinkModel.objects.filter(project_id=project_id)
    links = CardDevLinkModel.objects.filter(project_id=project_id)

    prs = links.filter(kind="pull_request")
    pr_open = prs.filter(state="open").count()
    pr_merged = prs.filter(state="merged").count()
    pr_closed = prs.filter(state="closed").count()

    return {
        "repos": [
            {
                "id": str(r.id),
                "full_name": r.full_name,
                "default_branch": r.default_branch,
                "webhook_active": r.webhook_id is not None,
            }
            for r in repos
        ],
        "prs": {
            "open": pr_open,
            "merged": pr_merged,
            "closed": pr_closed,
            "total": pr_open + pr_merged + pr_closed,
        },
        "branches": links.filter(kind="branch").count(),
        "commits": links.filter(kind="commit").count(),
        "linked_cards": links.values("card_id").distinct().count(),
        "recent_prs": [
            _link_dict(link) for link in prs.order_by("-updated_at")[:recent_limit]
        ],
    }


def project_pull_requests(
    project_id: str, *, state: str = "", limit: int = 30
) -> list[dict]:
    """Pull requests do projeto, mais recentes primeiro. `state` vazio = todos."""
    prs = CardDevLinkModel.objects.filter(project_id=project_id, kind="pull_request")
    if state:
        prs = prs.filter(state=state)
    return [_link_dict(link) for link in prs.order_by("-updated_at")[:limit]]


def project_repo_activity(project_id: str, *, limit: int = 20) -> dict:
    """Atividade recente do repo: commits e branches ligados a cards."""
    links = CardDevLinkModel.objects.filter(
        project_id=project_id, kind__in=("commit", "branch")
    ).order_by("-updated_at")[:limit]
    return {
        "activity": [{**_link_dict(link), "kind": link.kind} for link in links],
        "repos": [
            r.full_name
            for r in GithubRepoLinkModel.objects.filter(project_id=project_id)
        ],
    }
