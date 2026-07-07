"""Caso de uso: alterar papel de um membro no workspace."""
from contexts.identity.domain.repositories.workspace_repository import (
    MembershipRepository,
)
from contexts.identity.domain.value_objects.role import Role
from shared.domain.errors import ConflictError, NotFoundError, PermissionDeniedError


class UpdateMemberRole:
    """Muda o papel de um membro.

    Guards:
    - Actor deve ser owner ou admin.
    - Admin não pode alterar o papel de um owner.
    - Não é possível rebaixar o último owner (deixaria o workspace sem dono).
    - Actor não pode alterar o próprio papel.
    """

    def __init__(self, membership_repository: MembershipRepository) -> None:
        self.membership_repository = membership_repository

    def execute(
        self,
        *,
        workspace_id: str,
        actor_id: str,
        target_user_id: str,
        new_role: str,
    ) -> None:
        if actor_id == target_user_id:
            raise PermissionDeniedError("Você não pode alterar o próprio papel.")

        actor_role = self.membership_repository.role_of(
            workspace_id=workspace_id, user_id=actor_id
        )
        if actor_role is None or not actor_role.can_manage_members:
            raise PermissionDeniedError("Apenas owner ou admin podem alterar papéis.")

        target_role = self.membership_repository.role_of(
            workspace_id=workspace_id, user_id=target_user_id
        )
        if target_role is None:
            raise NotFoundError("Membro não encontrado no workspace.")

        # Admin não pode tocar em owner
        if actor_role == Role.ADMIN and target_role == Role.OWNER:
            raise PermissionDeniedError("Admin não pode alterar o papel de um owner.")

        new_role_enum = Role(new_role)

        # Impede deixar o workspace sem nenhum owner
        if target_role == Role.OWNER and new_role_enum != Role.OWNER:
            owners_count = self.membership_repository.count_owners(
                workspace_id=workspace_id
            )
            if owners_count <= 1:
                raise ConflictError(
                    "Não é possível rebaixar o único owner do workspace."
                )

        self.membership_repository.update_role(
            workspace_id=workspace_id,
            user_id=target_user_id,
            new_role=new_role_enum,
        )
