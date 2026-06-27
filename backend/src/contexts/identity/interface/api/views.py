"""Views finas do contexto identity — orquestram casos de uso."""
from django.conf import settings
from django.db import transaction
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from contexts.identity.application.use_cases.create_workspace import CreateWorkspace
from contexts.identity.application.use_cases.list_workspaces import ListWorkspaces
from contexts.identity.application.use_cases.register_user import RegisterUser
from contexts.identity.application.use_cases.send_verification_email import (
    SendVerificationEmail,
)
from contexts.identity.application.use_cases.verify_email import VerifyEmail
from contexts.identity.application.use_cases.request_password_reset import RequestPasswordReset
from contexts.identity.application.use_cases.reset_password import ResetPassword
from contexts.identity.infrastructure.django.email_sender_impl import DjangoEmailSender
from contexts.identity.infrastructure.django.repositories_impl import (
    DjangoMembershipRepository,
    DjangoUserRepository,
    DjangoWorkspaceRepository,
)
from contexts.identity.interface.api.serializers import (
    CreateWorkspaceSerializer,
    RegisterSerializer,
    UserSerializer,
    WorkspaceListItemSerializer,
    WorkspaceSerializer,
)
from shared.domain.errors import NotFoundError, ValidationError


class RegisterView(APIView):
    """Cadastro público de usuário."""

    permission_classes = [AllowAny]

    def post(self, request: Request) -> Response:
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        with transaction.atomic():
            use_case = RegisterUser(user_repository=DjangoUserRepository())
            result = use_case.execute(
                **serializer.validated_data,
                is_active=settings.AUTH_AUTO_ACTIVATE,
            )
            # Todo usuário nasce com um workspace pessoal (evita estado "sem workspace").
            CreateWorkspace(
                workspace_repository=DjangoWorkspaceRepository(),
                membership_repository=DjangoMembershipRepository(),
            ).execute(
                name=f"Workspace de {result.full_name}", owner_id=result.user_id
            )

        SendVerificationEmail(email_sender=DjangoEmailSender()).execute(
            user_id=result.user_id,
            user_email=result.email,
            full_name=result.full_name,
        )
        return Response(
            {
                "id": result.user_id,
                "email": result.email,
                "full_name": result.full_name,
                "message": "Cadastro realizado. Verifique seu email para ativar a conta.",
            },
            status=status.HTTP_201_CREATED,
        )


class VerifyEmailView(APIView):
    """Ativa conta via token recebido por email."""

    permission_classes = [AllowAny]

    def post(self, request: Request) -> Response:
        token = request.data.get("token", "").strip()
        if not token:
            return Response({"detail": "Token obrigatório."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            VerifyEmail().execute(token=token)
        except NotFoundError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_404_NOT_FOUND)
        except ValidationError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"message": "Email verificado. Sua conta está ativa!"}, status=status.HTTP_200_OK)


class ForgotPasswordView(APIView):
    """Solicita link de redefinição de senha."""

    permission_classes = [AllowAny]

    def post(self, request: Request) -> Response:
        email = request.data.get("email", "").strip()
        if not email:
            return Response({"detail": "Email obrigatório."}, status=status.HTTP_400_BAD_REQUEST)
        # sempre retorna 200 — não revela se email existe (anti-enumeração)
        RequestPasswordReset(email_sender=DjangoEmailSender()).execute(email=email)
        return Response(
            {"message": "Se este email estiver cadastrado, você receberá um link em breve."},
            status=status.HTTP_200_OK,
        )


class ResetPasswordView(APIView):
    """Redefine senha via token recebido por email."""

    permission_classes = [AllowAny]

    def post(self, request: Request) -> Response:
        token = request.data.get("token", "").strip()
        new_password = request.data.get("new_password", "")
        if not token or not new_password:
            return Response(
                {"detail": "Token e nova senha são obrigatórios."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(new_password) < 8:
            return Response(
                {"detail": "A senha deve ter ao menos 8 caracteres."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            ResetPassword().execute(token=token, new_password=new_password)
        except NotFoundError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_404_NOT_FOUND)
        except ValidationError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"message": "Senha redefinida com sucesso."}, status=status.HTTP_200_OK)


class MeView(APIView):
    """Dados do usuário autenticado."""

    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        user = request.user
        workspaces = ListWorkspaces(DjangoWorkspaceRepository()).execute(
            user_id=str(user.id)
        )
        data = UserSerializer(
            {"id": str(user.id), "email": user.email, "full_name": user.full_name}
        ).data
        # Inclui workspaces para o frontend saber em qual contexto operar.
        data["workspaces"] = WorkspaceListItemSerializer(
            [{"id": w.id, "name": w.name, "slug": w.slug} for w in workspaces],
            many=True,
        ).data
        return Response(data)


class WorkspaceCreateView(APIView):
    """Lista e cria workspaces do usuário autenticado."""

    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        workspaces = ListWorkspaces(DjangoWorkspaceRepository()).execute(
            user_id=str(request.user.id)
        )
        data = WorkspaceListItemSerializer(
            [{"id": w.id, "name": w.name, "slug": w.slug} for w in workspaces],
            many=True,
        ).data
        return Response(data)

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
