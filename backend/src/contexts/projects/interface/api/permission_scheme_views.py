"""Views de acesso por projeto e esquema de permissões (Domínio 12 — RBAC nível projeto).

GET  /api/projects/<id>/access/
     Lista membros do workspace com papel efetivo no projeto.
     Requer: ser membro do workspace.

PUT  /api/projects/<id>/access/
     Atribui papel explícito de projeto a um usuário.
     Requer: administer_project capability.

GET  /api/projects/<id>/permission-scheme/
     Devolve a matriz papéis × capacidades (fonte única — capabilities.py).
     Requer: ser membro do workspace.
"""
from __future__ import annotations

from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from contexts.identity.infrastructure.django.models import MembershipModel
from contexts.projects.infrastructure.django.models import (
    ProjectDeleteGrantModel,
    ProjectModel,
    ProjectRoleMemberModel,
    ProjectRoleModel,
)
from contexts.projects.interface.api.capabilities import (
    DEFAULT_ROLES,
    ROLE_CAPABILITIES,
    can_browse,
    can_delete_cards,
    effective_role,
)
from contexts.projects.interface.api.permissions import assert_project_capability
from shared.domain.errors import NotFoundError, PermissionDeniedError


def _member_item(membership, project: ProjectModel, explicit_roles: dict[str, str]) -> dict:
    user = membership.user
    user_id = str(membership.user_id)
    eff_role = effective_role(project, user_id)
    return {
        "user_id": user_id,
        "name": user.full_name,
        "email": user.email,
        "workspace_role": membership.role,
        "project_role": eff_role,   # role efetivo (explícito ou derivado)
        "explicit_role": explicit_roles.get(user_id),  # None se derivado
        "can_delete_cards": can_delete_cards(project, user_id),
    }


class ProjectAccessView(APIView):
    """GET/PUT /api/projects/<project_id>/access/."""

    permission_classes = [IsAuthenticated]

    def get(self, request: Request, project_id: str) -> Response:
        project = ProjectModel.objects.filter(id=project_id).first()
        if project is None:
            raise NotFoundError("Projeto não encontrado.")

        user_id = str(request.user.id)
        # Ver quem tem acesso a um board é ver o board: quem não enxerga o
        # projeto não deve descobrir quem trabalha nele.
        if not can_browse(project, user_id):
            raise PermissionDeniedError("Você não tem acesso a este projeto.")

        # Busca todas as atribuições explícitas para os projetos deste projeto
        explicit_qs = ProjectRoleMemberModel.objects.filter(
            role__project_id=project.id
        ).values("user_id", "role__slug")
        # Maior papel vence (admin > developer > viewer)
        _order = {"admin": 0, "developer": 1, "viewer": 2}
        explicit_roles: dict[str, str] = {}
        for item in explicit_qs:
            uid = str(item["user_id"])
            slug = item["role__slug"]
            current = _order.get(explicit_roles[uid], 99) if uid in explicit_roles else 99
            if _order.get(slug, 99) < current:
                explicit_roles[uid] = slug

        memberships = MembershipModel.objects.filter(
            workspace_id=project.workspace_id
        ).select_related("user")

        data = [_member_item(m, project, explicit_roles) for m in memberships]
        return Response(data)

    def put(self, request: Request, project_id: str) -> Response:
        """Atribui papel explícito de projeto a um usuário."""
        project = assert_project_capability(
            project_id=project_id,
            user_id=str(request.user.id),
            capability="administer_project",
        )

        target_user_id = str(request.data.get("user_id", ""))
        role_slug = str(request.data.get("role", ""))

        if role_slug not in ROLE_CAPABILITIES:
            raise ValueError(f"Papel inválido: {role_slug}. Use admin, developer ou viewer.")

        # Garante que o membro pertence ao workspace
        if not MembershipModel.objects.filter(
            workspace_id=project.workspace_id, user_id=target_user_id
        ).exists():
            raise NotFoundError("Usuário não é membro do workspace.")

        # Obtém ou cria o ProjectRoleModel correspondente ao slug
        role_name_map = {r["slug"]: r["name"] for r in DEFAULT_ROLES}
        project_role, _ = ProjectRoleModel.objects.get_or_create(
            project=project,
            slug=role_slug,
            defaults={"name": role_name_map.get(role_slug, role_slug.title()), "is_default": True},
        )

        # Remove atribuições anteriores deste usuário neste projeto e cria a nova
        ProjectRoleMemberModel.objects.filter(
            role__project=project, user_id=target_user_id
        ).delete()
        ProjectRoleMemberModel.objects.create(role=project_role, user_id=target_user_id)

        return Response({"user_id": target_user_id, "role": role_slug})

    def delete(self, request: Request, project_id: str) -> Response:
        """Remove a atribuição explícita de papel, voltando ao papel derivado.

        Requer: administer_project. O user_id vem por querystring (?user_id=)
        ou no corpo — DELETE não tem alvo na URL neste recurso de coleção.
        """
        project = assert_project_capability(
            project_id=project_id,
            user_id=str(request.user.id),
            capability="administer_project",
        )

        target_user_id = str(
            request.query_params.get("user_id") or request.data.get("user_id") or ""
        )
        if not target_user_id:
            raise ValueError("Informe o user_id do membro.")

        ProjectRoleMemberModel.objects.filter(
            role__project=project, user_id=target_user_id
        ).delete()

        # Papel volta a ser o derivado do workspace
        eff_role = effective_role(project, target_user_id)
        return Response({"user_id": target_user_id, "role": eff_role, "explicit_role": None})


class ProjectDeleteGrantView(APIView):
    """PUT/DELETE /api/projects/<project_id>/delete-grant/.

    Concede ou revoga a capacidade de deletar cards para um usuário
    específico do projeto. Quem já é admin não precisa disso (já tem tudo).
    """

    permission_classes = [IsAuthenticated]

    def put(self, request: Request, project_id: str) -> Response:
        project = assert_project_capability(
            project_id=project_id,
            user_id=str(request.user.id),
            capability="administer_project",
        )

        target_user_id = str(request.data.get("user_id", ""))
        if not MembershipModel.objects.filter(
            workspace_id=project.workspace_id, user_id=target_user_id
        ).exists():
            raise NotFoundError("Usuário não é membro do workspace.")

        ProjectDeleteGrantModel.objects.get_or_create(
            project=project, user_id=target_user_id
        )
        return Response({"user_id": target_user_id, "can_delete_cards": True})

    def delete(self, request: Request, project_id: str) -> Response:
        project = assert_project_capability(
            project_id=project_id,
            user_id=str(request.user.id),
            capability="administer_project",
        )

        target_user_id = str(
            request.query_params.get("user_id") or request.data.get("user_id") or ""
        )
        if not target_user_id:
            raise ValueError("Informe o user_id do membro.")

        ProjectDeleteGrantModel.objects.filter(
            project=project, user_id=target_user_id
        ).delete()
        return Response({"user_id": target_user_id, "can_delete_cards": False})


class ProjectPermissionSchemeView(APIView):
    """GET /api/projects/<project_id>/permission-scheme/.

    Retorna a matriz completa papéis × capacidades.
    Fonte única da verdade: capabilities.py.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request: Request, project_id: str) -> Response:
        project = ProjectModel.objects.filter(id=project_id).first()
        if project is None:
            raise NotFoundError("Projeto não encontrado.")

        user_id = str(request.user.id)
        if not MembershipModel.objects.filter(
            workspace_id=project.workspace_id, user_id=user_id
        ).exists():
            raise PermissionDeniedError("Você não tem acesso a este projeto.")

        # Coleta todas as capabilities conhecidas (union de todos os papéis)
        all_caps: set[str] = set()
        for caps in ROLE_CAPABILITIES.values():
            all_caps.update(caps)

        roles_data = []
        for role_def in DEFAULT_ROLES:
            slug = role_def["slug"]
            caps = sorted(ROLE_CAPABILITIES.get(slug, set()))
            roles_data.append(
                {
                    "slug": slug,
                    "name": role_def["name"],
                    "capabilities": caps,
                }
            )

        return Response(
            {
                "project_id": str(project.id),
                "roles": roles_data,
                "all_capabilities": sorted(all_caps),
            }
        )
