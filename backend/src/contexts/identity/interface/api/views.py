"""Views finas do contexto identity — orquestram casos de uso."""
from django.db import transaction
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from contexts.identity.application.use_cases.create_workspace import CreateWorkspace
from contexts.identity.application.use_cases.register_user import RegisterUser
from contexts.identity.infrastructure.django.repositories_impl import (
    DjangoMembershipRepository,
    DjangoUserRepository,
    DjangoWorkspaceRepository,
)
from contexts.identity.interface.api.serializers import (
    CreateWorkspaceSerializer,
    RegisterSerializer,
    UserSerializer,
    WorkspaceSerializer,
)


class RegisterView(APIView):
    """Cadastro público de usuário."""

    permission_classes = [AllowAny]

    def post(self, request: Request) -> Response:
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        use_case = RegisterUser(user_repository=DjangoUserRepository())
        result = use_case.execute(**serializer.validated_data)
        return Response(
            {
                "id": result.user_id,
                "email": result.email,
                "full_name": result.full_name,
            },
            status=status.HTTP_201_CREATED,
        )


class MeView(APIView):
    """Dados do usuário autenticado."""

    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        user = request.user
        data = UserSerializer(
            {"id": str(user.id), "email": user.email, "full_name": user.full_name}
        ).data
        return Response(data)


class WorkspaceCreateView(APIView):
    """Criação de workspace pelo usuário autenticado."""

    permission_classes = [IsAuthenticated]

    def post(self, request: Request) -> Response:
        serializer = CreateWorkspaceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        use_case = CreateWorkspace(
            workspace_repository=DjangoWorkspaceRepository(),
            membership_repository=DjangoMembershipRepository(),
        )
        # Escrita multi-passo (workspace + membership) dentro de uma transação
        with transaction.atomic():
            result = use_case.execute(
                name=serializer.validated_data["name"], owner_id=str(request.user.id)
            )
        return Response(
            WorkspaceSerializer(result).data, status=status.HTTP_201_CREATED
        )
