"""Regras de vínculo entre eventos do GitHub e cards do Pulse.

Estilo Jira: uma referência `KEY-123` (ex.: `AAAAA-1`) numa branch, mensagem de
commit ou título/branch de PR liga aquele artefato ao card correspondente.
"""
from __future__ import annotations

import hashlib
import hmac
import re
import unicodedata

from contexts.github.infrastructure.django.models import (
    CardDevLinkModel,
    GithubRepoLinkModel,
)
from contexts.projects.infrastructure.django.models import CardModel, ProjectModel

# KEY-123 — chave de projeto (2..10 alfanum, começa com letra) + número do card.
REF_RE = re.compile(r"\b([A-Za-z][A-Za-z0-9]{1,9})-(\d+)\b")


def verify_signature(*, secret: str, body: bytes, signature: str) -> bool:
    """Valida o header X-Hub-Signature-256 do webhook do GitHub."""
    if not signature or not secret:
        return False
    expected = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


def find_cards(project_id: str, text: str) -> list[CardModel]:
    """Acha os cards referenciados em `text` dentro do projeto do repo."""
    if not text:
        return []
    project = ProjectModel.objects.filter(id=project_id).first()
    if project is None:
        return []
    key = project.key.lower()
    numbers = {
        int(num) for k, num in REF_RE.findall(text) if k.lower() == key
    }
    if not numbers:
        return []
    return list(CardModel.objects.filter(project_id=project_id, number__in=numbers))


def upsert_link(*, card: CardModel, repo: GithubRepoLinkModel, kind: str, external_id: str, **fields) -> None:
    """Cria/atualiza um vínculo de desenvolvimento no card (idempotente)."""
    CardDevLinkModel.objects.update_or_create(
        card_id=card.id,
        kind=kind,
        external_id=str(external_id),
        defaults={
            "project_id": repo.project_id,
            "repo_full_name": repo.full_name,
            **fields,
        },
    )


def branch_name_for(card: CardModel, project_key: str) -> str:
    """Sugere um nome de branch estilo Jira: AAAAA-1-titulo-em-slug."""
    slug = unicodedata.normalize("NFKD", card.title).encode("ascii", "ignore").decode()
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", slug).strip("-").lower()[:50]
    ref = f"{project_key}-{card.number}"
    return f"{ref}-{slug}" if slug else ref


def handle_push(repo: GithubRepoLinkModel, payload: dict) -> int:
    """Processa evento push: liga commits e a branch aos cards referenciados."""
    linked = 0
    ref = payload.get("ref", "")  # refs/heads/AAAAA-1-...
    branch = ref.split("/", 2)[-1] if ref.startswith("refs/heads/") else ""
    for commit in payload.get("commits", []):
        text = f"{commit.get('message', '')} {branch}"
        for card in find_cards(str(repo.project_id), text):
            upsert_link(
                card=card,
                repo=repo,
                kind="commit",
                external_id=commit.get("id", "")[:40],
                title=commit.get("message", "")[:300].splitlines()[0] if commit.get("message") else "",
                url=commit.get("url", ""),
                branch=branch,
                author_login=(commit.get("author") or {}).get("username", "")
                or (commit.get("author") or {}).get("name", ""),
            )
            linked += 1
    # A branch em si também vira um vínculo, se referenciar um card.
    if branch:
        for card in find_cards(str(repo.project_id), branch):
            upsert_link(
                card=card,
                repo=repo,
                kind="branch",
                external_id=branch,
                title=branch,
                url=f"https://github.com/{repo.full_name}/tree/{branch}",
                branch=branch,
                state="open",
            )
            linked += 1
    return linked


def handle_pull_request(repo: GithubRepoLinkModel, payload: dict) -> int:
    """Processa evento pull_request: liga o PR aos cards referenciados."""
    pr = payload.get("pull_request", {})
    if not pr:
        return 0
    head = (pr.get("head") or {}).get("ref", "")
    text = f"{pr.get('title', '')} {head} {pr.get('body', '') or ''}"
    state = "merged" if pr.get("merged") else pr.get("state", "open")
    linked = 0
    for card in find_cards(str(repo.project_id), text):
        upsert_link(
            card=card,
            repo=repo,
            kind="pull_request",
            external_id=str(pr.get("number")),
            number=pr.get("number"),
            title=pr.get("title", "")[:300],
            url=pr.get("html_url", ""),
            state=state,
            branch=head,
            author_login=(pr.get("user") or {}).get("login", ""),
            author_avatar=(pr.get("user") or {}).get("avatar_url", ""),
        )
        linked += 1
    return linked
