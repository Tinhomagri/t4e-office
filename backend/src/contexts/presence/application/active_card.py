"""Caso de uso: card ativo (em 'Em andamento') de um usuário, e edição da
observação livre desse card. ORM direto sobre CardModel/CardHistoryModel do
app projects — mesmo padrão de assign_desk.py, sem passar pela camada de
domínio pesada do projects (aqui é leitura/escrita de um campo só)."""
from __future__ import annotations

from contexts.projects.infrastructure.django.models import CardHistoryModel, CardModel
from shared.domain.errors import NotFoundError, PermissionDeniedError


def get_active_card(*, user_id: str) -> dict | None:
    """Card em 'doing' mais recente (por transição de status) atribuído a
    `user_id`. `None` se não houver nenhum — é resultado válido, não erro.

    Um usuário raramente tem mais de um card em doing ao mesmo tempo; o loop
    abaixo prioriza clareza sobre uma query anotada única.
    """
    candidates = CardModel.objects.filter(assignee_id=user_id, status="doing").select_related(
        "project"
    )
    best_card = None
    best_since = None
    for card in candidates:
        entry = (
            CardHistoryModel.objects.filter(card_id=card.id, field="status", new_value="doing")
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
    """Atualiza a observação do card — só quem é o assignee pode."""
    card = CardModel.objects.filter(id=card_id).first()
    if card is None:
        raise NotFoundError("Card não encontrado.")
    if str(card.assignee_id) != str(user_id):
        raise PermissionDeniedError("Só o responsável pelo card pode editar a observação.")
    card.working_note = note
    card.save(update_fields=["working_note"])
