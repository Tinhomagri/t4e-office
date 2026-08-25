"""Caso de uso: alterar os spaces que um membro pode ver."""
from contexts.identity.domain.repositories.workspace_repository import (
    MembershipRepository,
)
from shared.domain.errors import NotFoundError, PermissionDeniedError, ValidationError

VALID_SPACES = {"boards", "marketing", "comercial"}


class UpdateMemberSpaces:
    """Muda a lista de spaces visíveis para um membro.

    Guards:
    - Actor deve ser owner ou admin.
    - allowed_spaces, quando não None, só pode conter valores válidos.

    Semântica de allowed_spaces:
    - None = sem restrição, o membro vê todos os spaces (default).
    - [] = restrição total, o membro não vê nenhum space (escolha explícita).
    - ["boards", ...] = só vê os spaces listados.

    Owner/Admin sempre enxergam tudo, independentemente do valor armazenado
    (essa regra é aplicada na leitura/permissão, não aqui na escrita — nada
    impede de gravar um allowed_spaces num owner, só não terá efeito).
    """

    def __init__(self, membership_repository: MembershipRepository) -> None:
        self.membership_repository = membership_repository

    def execute(
        self,
        *,
        workspace_id: str,
        actor_id: str,
        target_user_id: str,
        allowed_spaces: list[str] | None,
    ) -> None:
        actor_role = self.membership_repository.role_of(
            workspace_id=workspace_id, user_id=actor_id
        )
        if actor_role is None or not actor_role.can_manage_members:
            raise PermissionDeniedError(
                "Apenas owner ou admin podem alterar spaces de um membro."
            )

        target_role = self.membership_repository.role_of(
            workspace_id=workspace_id, user_id=target_user_id
        )
        if target_role is None:
            raise NotFoundError("Membro não encontrado no workspace.")

        if allowed_spaces is not None:
            invalid = set(allowed_spaces) - VALID_SPACES
            if invalid:
                raise ValidationError(
                    f"Spaces inválidos: {', '.join(sorted(invalid))}."
                )

        self.membership_repository.update_allowed_spaces(
            workspace_id=workspace_id,
            user_id=target_user_id,
            allowed_spaces=allowed_spaces,
        )
