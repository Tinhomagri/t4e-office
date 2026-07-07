"""Caso de uso: remover um membro do workspace."""
from django.db import transaction

from contexts.identity.domain.repositories.workspace_repository import (
    MembershipRepository,
)
from contexts.identity.domain.value_objects.role import Role
from shared.domain.errors import ConflictError, NotFoundError, PermissionDeniedError


class RemoveMember:
    """Remove um membro do workspace.

    Guards:
    - Actor deve ser owner ou admin.
    - Admin não pode remover um owner.
    - Não é possível remover o último owner.

    Efeito colateral (atômico):
    - Remove todas as atribuições de ProjectRoleMember do usuário nos projetos
      deste workspace (acoplamento por id, como já feito em capabilities.py).
    """

    def __init__(self, membership_repository: MembershipRepository) -> None:
        self.membership_repository = membership_repository

    @transaction.atomic
    def execute(
        self,
        *,
        workspace_id: str,
        actor_id: str,
        target_user_id: str,
    ) -> None:
        actor_role = self.membership_repository.role_of(
            workspace_id=workspace_id, user_id=actor_id
        )
        if actor_role is None or not actor_role.can_manage_members:
            raise PermissionDeniedError("Apenas owner ou admin podem remover membros.")

        target_role = self.membership_repository.role_of(
            workspace_id=workspace_id, user_id=target_user_id
        )
        if target_role is None:
            raise NotFoundError("Membro não encontrado no workspace.")

        # Admin não pode remover owner
        if actor_role == Role.ADMIN and target_role == Role.OWNER:
            raise PermissionDeniedError("Admin não pode remover um owner.")

        # Último owner não pode ser removido
        if target_role == Role.OWNER:
            owners_count = self.membership_repository.count_owners(
                workspace_id=workspace_id
            )
            if owners_count <= 1:
                raise ConflictError(
                    "Não é possível remover o único owner do workspace."
                )

        # Cascata: remove atribuições de papel de projeto no workspace
        from contexts.projects.infrastructure.django.models import (
            ProjectModel,
            ProjectRoleMemberModel,
        )

        project_ids = ProjectModel.objects.filter(
            workspace_id=workspace_id
        ).values_list("id", flat=True)
        ProjectRoleMemberModel.objects.filter(
            role__project_id__in=list(project_ids),
            user_id=target_user_id,
        ).delete()

        self.membership_repository.remove(
            workspace_id=workspace_id,
            user_id=target_user_id,
        )
