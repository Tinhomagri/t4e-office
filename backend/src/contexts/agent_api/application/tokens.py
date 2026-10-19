"""Tokens de agente: hash, resolução e importação do arquivo de hashes."""
from __future__ import annotations

import hashlib
import secrets

from django.db import transaction
from django.utils import timezone
from django.utils.text import slugify

from contexts.agent_api.infrastructure.models import AgentTokenModel


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def resolve_agent(token: str) -> AgentTokenModel | None:
    """Agente ATIVO dono do token, ou None."""
    return AgentTokenModel.objects.filter(token_hash=hash_token(token), ativo=True).first()


@transaction.atomic
def import_agents(data: dict, workspace) -> tuple[int, int]:
    """Cria/atualiza os agentes do arquivo `{"agents": [...]}` e os vincula ao
    workspace. Agente de arquivo que sumiu do arquivo é desativado (não
    apagado — a auditoria dele continua apontando pra algum lugar); chaves
    geradas pela tela não são tocadas. Devolve (criados, atualizados)."""
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
    # Só os que vieram de arquivo (sem `criado_por`) e deste workspace: chave
    # gerada pela tela não pode ser revogada por um arquivo que nem a conhece.
    AgentTokenModel.objects.filter(criado_por__isnull=True, workspaces=workspace).exclude(
        id__in=ids
    ).update(ativo=False)
    return created, updated


# Prefixo deixa a chave reconhecível num log ou num vazamento (e o middleware
# não confunde com PAT `t4e_pat_` nem JWT).
KEY_PREFIX = "t4e_agt_"


@transaction.atomic
def create_key(*, workspace, nome: str, actor) -> tuple[AgentTokenModel, str]:
    """Gera uma chave nova para o workspace. Devolve (agente, chave_em_texto):
    a chave só existe neste retorno — o banco guarda o SHA-256."""
    chave = KEY_PREFIX + secrets.token_urlsafe(32)
    base = slugify(nome)[:40] or "chave"
    agent = AgentTokenModel.objects.create(
        id=f"{base}-{secrets.token_hex(4)}",
        nome=nome,
        token_hash=hash_token(chave),
        escopos=["office:ler"],
        criado_por=actor,
    )
    agent.workspaces.add(workspace)
    return agent, chave


def touch_last_use(agent: AgentTokenModel) -> None:
    """Marca o último uso sem escrever no banco a cada requisição: no máximo
    uma escrita por minuto por chave."""
    now = timezone.now()
    if agent.ultimo_uso is None or (now - agent.ultimo_uso).total_seconds() >= 60:
        AgentTokenModel.objects.filter(pk=agent.pk).update(ultimo_uso=now)
        agent.ultimo_uso = now
