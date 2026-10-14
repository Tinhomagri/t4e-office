"""Tokens de agente: hash, resolução e importação do arquivo de hashes."""
from __future__ import annotations

import hashlib

from django.db import transaction

from contexts.agent_api.infrastructure.models import AgentTokenModel


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def resolve_agent(token: str) -> AgentTokenModel | None:
    """Agente ATIVO dono do token, ou None."""
    return AgentTokenModel.objects.filter(token_hash=hash_token(token), ativo=True).first()


@transaction.atomic
def import_agents(data: dict, workspace) -> tuple[int, int]:
    """Cria/atualiza os agentes do arquivo `{"agents": [...]}` e os vincula ao
    workspace. Agente que sumiu do arquivo é desativado (não apagado — a
    auditoria dele continua apontando pra algum lugar). Devolve
    (criados, atualizados)."""
    created = updated = 0
    ids = []
    for item in data.get("agents", []):
        agent, was_created = AgentTokenModel.objects.update_or_create(
            id=item["id"],
            defaults={
                "token_hash": item["token_hash"].lower(),
                "ativo": bool(item.get("ativo", True)),
                "escopos": list(item.get("escopos", [])),
            },
        )
        agent.workspaces.add(workspace)
        ids.append(agent.id)
        created += was_created
        updated += not was_created
    AgentTokenModel.objects.exclude(id__in=ids).update(ativo=False)
    return created, updated
