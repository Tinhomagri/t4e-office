"""Endpoint que expõe o papel e capacidades do usuário atual num projeto.

O frontend consome para esconder/desabilitar ações sem permissão (Domínio 12).
"""
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from contexts.projects.infrastructure.django.models import ProjectModel
from contexts.projects.interface.api.capabilities import (
    capabilities_for,
    effective_role,
)
from shared.domain.errors import NotFoundError, PermissionDeniedError


class MyProjectPermissionsView(APIView):
    """GET /api/projects/<project_id>/my-permissions/."""

    permission_classes = [IsAuthenticated]

    def get(self, request: Request, project_id: str) -> Response:
        project = ProjectModel.objects.filter(id=project_id).first()
        if project is None:
            raise NotFoundError("Projeto não encontrado.")
        role = effective_role(project, str(request.user.id))
        if role is None:
            # Não-membro: sem acesso ao projeto.
            raise PermissionDeniedError("Você não tem acesso a este projeto.")
        return Response(
            {
                "project_id": str(project.id),
                "role": role,
                "capabilities": sorted(capabilities_for(project, str(request.user.id))),
            }
        )
