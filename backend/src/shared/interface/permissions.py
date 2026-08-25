"""Permissões DRF compartilhadas entre contextos."""
from rest_framework.permissions import BasePermission
from rest_framework.request import Request
from rest_framework.views import APIView

from contexts.copilot.infrastructure.django.repositories_impl import (
    DjangoWorkspaceAccess,
)
from shared.domain.errors import PermissionDeniedError


class SpaceAccessPermission(BasePermission):
    """Bloqueia o request se o membro não tem o space (view.required_space)
    liberado. Views que usam isso devem também exigir workspace_id (query
    param ou request.data) e IsAuthenticated antes desta na lista de
    permission_classes.

    `required_space` é opt-in: uma view que não declara o atributo não é
    afetada por esta permission (retorna True sempre) — não é um default-deny
    global, é um gate específico por view.

    Quando workspace_id está ausente ou o usuário não é membro do workspace,
    esta permission libera (retorna True) e deixa o `_require_member`-style
    check próprio da view levantar o erro (PermissionDeniedError/
    ValidationError) — assim a mensagem de erro que chega ao cliente é a que
    a própria view já produz para "não é membro"/"workspace_id obrigatório",
    em vez de um 403 genérico e redundante vindo daqui.
    """

    def has_permission(self, request: Request, view: APIView) -> bool:
        required_space = getattr(view, "required_space", None)
        if required_space is None:
            return True

        workspace_id = request.query_params.get("workspace_id") or request.data.get(
            "workspace_id"
        )
        if not workspace_id:
            return True

        user = request.user
        if not getattr(user, "is_authenticated", False):
            return True

        access = DjangoWorkspaceAccess()
        if not access.is_member(workspace_id=str(workspace_id), user_id=str(user.id)):
            return True

        return access.can_view_space(
            workspace_id=str(workspace_id),
            user_id=str(user.id),
            space=required_space,
        )


def require_space(*, workspace_id: str, user_id: str, space: str) -> None:
    """Levanta PermissionDeniedError se o usuário não tem o space liberado
    nesse workspace. Para views que só descobrem o workspace_id depois de
    buscar a entidade pelo ID (SpaceAccessPermission não serve aí, roda
    antes do corpo da view).

    Use em métodos de detalhe/mutação após a use case retornar a entidade.
    """
    if not DjangoWorkspaceAccess().can_view_space(
        workspace_id=str(workspace_id), user_id=str(user_id), space=space
    ):
        raise PermissionDeniedError("Você não tem acesso a este módulo.")
