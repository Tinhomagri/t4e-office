"""Caso de uso: alterar os spaces que um membro pode ver."""
from contexts.identity.domain.repositories.workspace_repository import (
    MembershipRepository,
)
from shared.domain.errors import NotFoundError, PermissionDeniedError, ValidationError

VALID_SPACES = {"boards", "marketing", "comercial"}


class UpdateMemberSpaces:
    """Muda a lista de spaces visíveis para um membro.

    Guards:
    - Actor deve ser owner.
    - allowed_spaces só pode conter valores válidos.

    Semântica de allowed_spaces:
    - [] = nenhum space liberado.
    - ["boards", ...] = só vê os spaces listados.

    Apenas owner enxerga todos; admin e member sempre dependem dessa lista.
    """

    def __init__(self, membership_repository: MembershipRepository) -> None:
        self.membership_repository = membership_repository

    def execute(
        self,
        *,
        workspace_id: str,
        actor_id: str,
        target_user_id: str,
        allowed_spaces: list[str],
    ) -> None:
        actor_role = self.membership_repository.role_of(
            workspace_id=workspace_id, user_id=actor_id
        )
        if actor_role is None or actor_role.value != "owner":
            raise PermissionDeniedError("Apenas o dono pode alterar spaces de um membro.")

        target_role = self.membership_repository.role_of(
            workspace_id=workspace_id, user_id=target_user_id
        )
        if target_role is None:
            raise NotFoundError("Membro não encontrado no workspace.")

        invalid = set(allowed_spaces) - VALID_SPACES
        if invalid:
            raise ValidationError(f"Spaces inválidos: {', '.join(sorted(invalid))}.")

        self.membership_repository.update_allowed_spaces(
            workspace_id=workspace_id,
            user_id=target_user_id,
            allowed_spaces=allowed_spaces,
        )
