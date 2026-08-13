"""Caso de uso: card ativo (em 'Em andamento') de um usuário, e edição da
observação livre desse card. ORM direto sobre CardModel/CardHistoryModel do
app projects — mesmo padrão de assign_desk.py, sem passar pela camada de
domínio pesada do projects (aqui é leitura/escrita de um campo só)."""
from __future__ import annotations

from django.db.models import Exists, OuterRef

from contexts.identity.infrastructure.django.models import MembershipModel
from contexts.projects.infrastructure.django.models import (
    CardHistoryModel,
    CardModel,
    WorkflowStatusModel,
)
from shared.domain.errors import NotFoundError, PermissionDeniedError


def get_active_card(*, workspace_id: str, user_id: str) -> dict | None:
    """Card em 'doing' mais recente (por transição de status) atribuído a
    `user_id` DENTRO do workspace `workspace_id`. `None` se não houver
    nenhum — é resultado válido, não erro.

    A filtragem por workspace é obrigatória: um usuário pode ser membro de
    vários workspaces e ter cards ativos em qualquer um deles — sem esse
    filtro, um admin de um workspace poderia ver o card ativo (título,
    projeto, observação) de um card que pertence a outro workspace.

    Um usuário raramente tem mais de um card em doing ao mesmo tempo; o loop
    abaixo prioriza clareza sobre uma query anotada única.
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
    best_card = None
    best_since = None
    for card in candidates:
        entry = (
            # Desde quando está nesta coluna — que pode não se chamar "doing".
            CardHistoryModel.objects.filter(
                card_id=card.id, field="status", new_value=card.status
            )
            .order_by("-created_at")
            .first()
        )
        since = entry.created_at if entry else card.created_at
        if best_since is None or since > best_since:
            best_since = since
            best_card = card

    if best_card is None:
        return None

    return {
        "active": True,
        "card": {
            "id": str(best_card.id),
            "number": best_card.number,
            "title": best_card.title,
            "project": best_card.project.key,
        },
        "doing_since": best_since.isoformat(),
        "working_note": best_card.working_note,
    }


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
