"""Caso de uso: card ativo (em 'Em andamento') de um usuário, e edição da
observação livre desse card. ORM direto sobre CardModel/CardHistoryModel do
app projects — mesmo padrão de assign_desk.py, sem passar pela camada de
domínio pesada do projects (aqui é leitura/escrita de um campo só)."""
from __future__ import annotations

from django.db.models import Exists, OuterRef

from contexts.identity.infrastructure.django.models import MembershipModel
from contexts.projects.infrastructure.django.models import (
    CardModel,
    WorkflowStatusModel,
)
from contexts.projects.infrastructure.working_time_query import working_time_for_cards
from shared.domain.errors import NotFoundError, PermissionDeniedError


def get_active_card(*, workspace_id: str, user_id: str) -> dict | None:
    """Todos os cards em 'doing' (por transição de status) atribuídos a
    `user_id` DENTRO do workspace `workspace_id`. `None` se não houver
    nenhum — é resultado válido, não erro.

    A filtragem por workspace é obrigatória: um usuário pode ser membro de
    vários workspaces e ter cards ativos em qualquer um deles — sem esse
    filtro, um admin de um workspace poderia ver o card ativo (título,
    projeto, observação) de um card que pertence a outro workspace.

    Uma pessoa pode ter mais de um card em doing ao mesmo tempo — devolve
    todos, ordenados do mais recente para o mais antigo na coluna.
    """
    # Qual coluna conta como "trabalhando nisso" é configuração do quadro
    # (`is_working`), não o slug "doing" cravado no código: um quadro que
    # chamasse a coluna de outro jeito não acionava nada.
    em_trabalho = WorkflowStatusModel.objects.filter(
        project_id=OuterRef("project_id"), slug=OuterRef("status"), is_working=True
    )
    candidates = CardModel.objects.filter(
        Exists(em_trabalho), assignee_id=user_id, project__workspace_id=workspace_id
    ).select_related("project")

    candidates = list(candidates)
    working = working_time_for_cards(candidates)
    cards = []
    for card in candidates:
        # Desde quando está contando (null se pausado) + o acumulado — mesma
        # regra do board (`domain.working_time`).
        wt = working[str(card.id)]
        cards.append(
            {
                "id": str(card.id),
                "project_id": str(card.project_id),
                "number": card.number,
                "title": card.title,
                "project": card.project.key,
                "doing_since": wt.running_since.isoformat() if wt.running_since else None,
                "paused_at": wt.paused_at.isoformat() if wt.paused_at else None,
                "worked_seconds": wt.worked_seconds,
                "working_note": card.working_note,
            }
        )

    if not cards:
        return None

    # Rodando primeiro, mais recente no topo; pausados depois.
    cards.sort(key=lambda c: c["doing_since"] or "", reverse=True)
    return {"active": True, "cards": cards}


def update_working_note(*, card_id: str, user_id: str, note: str) -> None:
    """Atualiza a observação do card — só quem é o assignee E ainda é membro
    do workspace do card pode. Sem a checagem de membership, quem foi removido
    do workspace mas continua como responsável do card seguiria editando a
    observação indefinidamente."""
    card = CardModel.objects.filter(id=card_id).select_related("project").first()
    if card is None:
        raise NotFoundError("Card não encontrado.")
    if str(card.assignee_id) != str(user_id):
        raise PermissionDeniedError("Só o responsável pelo card pode editar a observação.")
    if not MembershipModel.objects.filter(
        workspace_id=card.project.workspace_id, user_id=user_id
    ).exists():
        raise PermissionDeniedError("Você não tem acesso a este workspace.")
    card.working_note = note
    card.save(update_fields=["working_note"])
