"""Views finas do contexto identity — orquestram casos de uso."""
import logging

from django.conf import settings
from django.db import transaction
from django.shortcuts import redirect
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import InvalidToken
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenRefreshView

from contexts.google.infrastructure.django.oauth_provider_impl import (
    SCOPES,
    GoogleOAuthProvider,
)
from contexts.identity.application.use_cases.authenticate_with_google import (
    AuthenticateWithGoogle,
)
from contexts.identity.application.use_cases.create_workspace import CreateWorkspace
from contexts.identity.application.use_cases.list_workspaces import ListWorkspaces
from contexts.identity.application.use_cases.register_user import RegisterUser
from contexts.identity.application.use_cases.request_password_reset import RequestPasswordReset
from contexts.identity.application.use_cases.reset_password import ResetPassword
from contexts.identity.application.use_cases.send_verification_email import (
    SendVerificationEmail,
)
from contexts.identity.application.use_cases.verify_email import VerifyEmail
from contexts.identity.infrastructure.django.email_sender_impl import DjangoEmailSender
from contexts.identity.infrastructure.django.google_login_state import (
    issue_state,
    verify_state,
)
from contexts.identity.infrastructure.django.models import UserModel
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

logger = logging.getLogger(__name__)


def _google_login_provider() -> GoogleOAuthProvider:
    """Provider do login com Google.

    Pede os escopos COMPLETOS (agenda + chat), não só a identidade: quem entra
    com o Google não deveria ter de "conectar o Google" de novo depois. Com
    isso o callback já grava a conexão e Agenda/Reuniões/Chat funcionam no
    primeiro acesso — em troca de uma tela de consentimento mais longa.
    """
    return GoogleOAuthProvider(
        redirect_uri=settings.GOOGLE_OAUTH_LOGIN_REDIRECT_URI,
        scopes=SCOPES,
        include_granted_scopes=False,
    )


def _save_google_connection(*, user_id: str, tokens) -> None:
    """Grava a conexão Google a partir dos tokens do login.

    Silencioso por design: o login não pode falhar porque a integração não
    pôde ser salva. Sem `refresh_token` (o Google só o manda no primeiro
    consentimento) não há acesso offline, então nem tentamos — a pessoa
    conecta pela tela de integrações quando precisar.
    """
    if not getattr(tokens, "refresh_token", None):
        return
    try:
        from contexts.google.domain.entities.connection import (
            ConnectionStatus,
            GoogleConnection,
        )
        from contexts.google.infrastructure.django.repositories_impl import (
            DjangoConnectionRepository,
        )

        DjangoConnectionRepository().upsert(
            connection=GoogleConnection(
                user_id=str(user_id),
                google_email=tokens.email or "",
                refresh_token=tokens.refresh_token,
                access_token=tokens.access_token,
                expiry=tokens.expiry,
                scopes=tokens.scopes,
                status=ConnectionStatus.ACTIVE,
            )
        )
    except Exception:  # noqa: BLE001 — integração é bônus, login é o essencial
        logger.warning("Não foi possível salvar a conexão Google do login", exc_info=True)


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


class GoogleLoginUrlView(APIView):
    """Gera a URL de consentimento Google p/ login/cadastro (sem sessão)."""

    permission_classes = [AllowAny]

    def get(self, request: Request) -> Response:
        state = issue_state()
        url = _google_login_provider().build_authorization_url(state=state)
        return Response({"authorization_url": url})


class GoogleLoginCallbackView(APIView):
    """Callback do fluxo Google de login/cadastro — emite JWT e redireciona."""

    permission_classes = [AllowAny]

    def get(self, request: Request) -> Response:
        front = settings.FRONTEND_URL
        callback_path = "/login/google/callback"

        if request.query_params.get("error"):
            return redirect(f"{front}{callback_path}?error=denied")

        code = request.query_params.get("code", "")
        state = request.query_params.get("state", "")
        if not code or not verify_state(state):
            return redirect(f"{front}{callback_path}?error=invalid_state")

        try:
            tokens = _google_login_provider().exchange_code(code=code)
        except Exception:
            logger.exception("Falha ao trocar code por tokens no login Google")
            return redirect(f"{front}{callback_path}?error=exchange_failed")

        try:
            with transaction.atomic():
                result = AuthenticateWithGoogle(
                    user_repository=DjangoUserRepository()
                ).execute(email=tokens.email or "", full_name=tokens.name or "")
                if result.created:
                    CreateWorkspace(
                        workspace_repository=DjangoWorkspaceRepository(),
                        membership_repository=DjangoMembershipRepository(),
                    ).execute(
                        name=f"Workspace de {result.full_name}", owner_id=result.user_id
                    )
        except ValidationError:
            return redirect(f"{front}{callback_path}?error=no_email")

        # Aproveita os tokens do próprio login como conexão Google. Sem isto
        # eles seriam descartados e a pessoa cairia num "conecte sua conta"
        # logo após ter acabado de entrar com essa mesma conta.
        _save_google_connection(user_id=result.user_id, tokens=tokens)

        user_row = UserModel.objects.get(id=result.user_id)
        refresh = RefreshToken.for_user(user_row)
        return redirect(
            f"{front}{callback_path}?access={refresh.access_token}&refresh={refresh}"
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


class TokenRefreshSafeView(TokenRefreshView):
    """Refresh que trata token órfão como 401, não como 500.

    O `TokenRefreshSerializer` do simplejwt busca o usuário do `user_id` do
    token e deixa `UserModel.DoesNotExist` subir — 500. Isso acontece sempre que
    o banco é recriado ou o usuário é removido enquanto um refresh token válido
    segue no browser: o front então nem sabe que precisa reautenticar, porque
    500 não é o sinal que ele trata. 401 é a resposta correta — o token existe,
    mas não autentica mais ninguém.
    """

    def post(self, request: Request, *args: object, **kwargs: object) -> Response:
        try:
            return super().post(request, *args, **kwargs)
        except UserModel.DoesNotExist:
            raise InvalidToken("Usuário do token não existe mais.") from None


class MeView(APIView):
    """Dados do usuário autenticado."""

    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        user = request.user
        workspaces = ListWorkspaces(DjangoWorkspaceRepository()).execute(
            user_id=str(user.id)
        )
        data = UserSerializer(
            {"id": str(user.id), "email": user.email, "full_name": user.full_name, "avatar_url": user.avatar_image or None}
        ).data
        # Inclui workspaces para o frontend saber em qual contexto operar.
        data["workspaces"] = WorkspaceListItemSerializer(
            [{"id": w.id, "name": w.name, "slug": w.slug} for w in workspaces],
            many=True,
        ).data
        return Response(data)

    def patch(self, request: Request) -> Response:
        user = request.user
        if "full_name" in request.data:
            name = str(request.data["full_name"] or "").strip()
            if not name:
                raise ValidationError("O nome não pode ficar vazio.")
            if len(name) > 200:
                raise ValidationError("O nome deve ter no máximo 200 caracteres.")
            user.full_name = name
        if "avatar_image" in request.data:
            image = str(request.data["avatar_image"] or "")
            if image and not image.startswith(("data:image/", "https://", "http://")):
                raise ValidationError("Imagem de perfil inválida.")
            if len(image) > 700_000:
                raise ValidationError("Imagem de perfil grande demais.")
            user.avatar_image = image
        user.save(update_fields=["full_name", "avatar_image"])
        return Response({"id": str(user.id), "email": user.email, "full_name": user.full_name, "avatar_url": user.avatar_image or None})


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
