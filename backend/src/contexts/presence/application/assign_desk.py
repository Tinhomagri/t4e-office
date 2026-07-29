"""Caso de uso: atribuir/desatribuir mesa. Sem request/response — puro Django ORM."""
from __future__ import annotations

from django.db import transaction

from contexts.presence.infrastructure.django.models import DeskAssignmentModel


@transaction.atomic
def assign_desk(
    *, workspace_id: str, floor: int, seat_id: str, user_id: str | None
) -> None:
    """Atribui `seat_id` a `user_id`, ou libera a mesa se `user_id` for None.

    Atribuir mesa nova a alguém libera a mesa antiga dela primeiro — sem isso
    a constraint `uniq_desk_per_user` rejeitaria a escrita (a pessoa não pode
    ter duas mesas ao mesmo tempo).
    """
    if user_id is None:
        DeskAssignmentModel.objects.filter(
            workspace_id=workspace_id, floor=floor, seat_id=seat_id
        ).delete()
        return

    DeskAssignmentModel.objects.filter(
        workspace_id=workspace_id, user_id=user_id
    ).exclude(floor=floor, seat_id=seat_id).delete()

    DeskAssignmentModel.objects.update_or_create(
        workspace_id=workspace_id,
        floor=floor,
        seat_id=seat_id,
        defaults={"user_id": user_id},
    )


def list_desk_assignments(
    *, workspace_id: str, floor: int
) -> list[DeskAssignmentModel]:
    """Todas as atribuições do andar, com o usuário já carregado (sem N+1)."""
    return list(
        DeskAssignmentModel.objects.filter(
            workspace_id=workspace_id, floor=floor
        ).select_related("user")
    )
