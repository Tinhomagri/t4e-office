"""Views finas dos endpoints /api/oauth/ — fluxo OAuth do conector MCP
(claude.ai Connectors). Ver docs/superpowers/specs/2026-09-01-mcp-oauth-connector-design.md.

Endpoints server-to-server (token-exchange, revoke-by-value) exigem o header
X-Internal-Secret batendo com settings.OAUTH_INTERNAL_SECRET — não usam
autenticação de usuário. O registro de client é intencionalmente sem auth
(RFC 7591). authorize-code exige sessão normal do office (usuário logado).
"""
import secrets
from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from contexts.identity.infrastructure.django.personal_token_authentication import (
    generate_token,
    hash_token,
)
from contexts.identity.interface.api.oauth_serializers import (
    OAuthAuthorizeCodeSerializer,
    OAuthClientRegisterSerializer,
    OAuthClientSerializer,
    OAuthRevokeByValueSerializer,
    OAuthTokenExchangeSerializer,
)

_CODE_TTL_MINUTES = 2


def _check_internal_secret(request) -> bool:
    expected = getattr(settings, "OAUTH_INTERNAL_SECRET", "")
    got = request.headers.get("X-Internal-Secret", "")
    return bool(expected) and got == expected


class OAuthClientRegisterView(APIView):
    """POST /api/oauth/clients/ — registro dinâmico de client (RFC 7591).

    Sem auth por design: é assim que o padrão funciona (o client se
    autorregistra antes de qualquer usuário logar). Idempotente por
    client_id — chamar de novo com o mesmo client_id só atualiza os dados.
    """

    permission_classes = [AllowAny]

    def post(self, request: Request) -> Response:
        from contexts.identity.infrastructure.django.models import OAuthClientModel

        serializer = OAuthClientRegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        client, created = OAuthClientModel.objects.update_or_create(
            client_id=data["client_id"],
            defaults={
                "client_name": data.get("client_name", ""),
                "redirect_uris": data["redirect_uris"],
                "token_endpoint_auth_method": data.get("token_endpoint_auth_method", "client_secret_post"),
                "client_secret": data.get("client_secret", ""),
            },
        )
        response_status = status.HTTP_201_CREATED if created else status.HTTP_200_OK
        return Response(OAuthClientSerializer(client).data, status=response_status)


class OAuthClientDetailView(APIView):
    """GET /api/oauth/clients/<client_id>/ — sem auth, dado não sensível."""

    permission_classes = [AllowAny]

    def get(self, request: Request, client_id: str) -> Response:
        from contexts.identity.infrastructure.django.models import OAuthClientModel

        client = OAuthClientModel.objects.filter(client_id=client_id).first()
        if client is None:
            return Response(status=status.HTTP_404_NOT_FOUND)
        return Response(OAuthClientSerializer(client).data)


class OAuthAuthorizeCodeView(APIView):
    """POST /api/oauth/authorize-code/ — exige sessão normal do office.

    Chamado pelo frontend depois do clique em "Permitir" na tela de
    consentimento. Gera um código de autorização de curta duração pro
    usuário logado.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request: Request) -> Response:
        from contexts.identity.infrastructure.django.models import (
            OAuthAuthorizationCodeModel,
        )

        serializer = OAuthAuthorizeCodeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        code = secrets.token_urlsafe(32)
        OAuthAuthorizationCodeModel.objects.create(
            code=code,
            client_id=data["client_id"],
            user=request.user,
            redirect_uri=data["redirect_uri"],
            expires_at=timezone.now() + timedelta(minutes=_CODE_TTL_MINUTES),
        )
        return Response({"code": code})


class OAuthTokenExchangeView(APIView):
    """POST /api/oauth/token-exchange/ — server-to-server (mcp-server → web).

    Troca um código de autorização (já consentido pelo usuário) por um
    PersonalAccessToken de verdade — o mesmo mecanismo de Configurações →
    Tokens de API, gerado via generate_token() (nunca reimplementado aqui).
    """

    permission_classes = [AllowAny]

    def post(self, request: Request) -> Response:
        from contexts.identity.infrastructure.django.models import (
            OAuthAuthorizationCodeModel,
            PersonalAccessToken,
        )

        if not _check_internal_secret(request):
            return Response(status=status.HTTP_403_FORBIDDEN)

        serializer = OAuthTokenExchangeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        code_value = serializer.validated_data["code"]

        row = OAuthAuthorizationCodeModel.objects.filter(code=code_value).first()
        if row is None or row.used_at is not None or row.expires_at < timezone.now():
            return Response(status=status.HTTP_400_BAD_REQUEST)

        row.used_at = timezone.now()
        row.save(update_fields=["used_at"])

        raw_token, digest = generate_token()
        PersonalAccessToken.objects.create(
            user=row.user, name="Conector MCP (claude.ai)", token_hash=digest
        )
        return Response(
            {
                "access_token": raw_token,
                "user_id": str(row.user_id),
                "email": row.user.email,
            }
        )


class OAuthRevokeByValueView(APIView):
    """POST /api/oauth/revoke-by-value/ — server-to-server (mcp-server → web).

    Recebe o valor bruto do token (não temos o id do lado do mcp-server),
    faz o mesmo hash usado em generate_token()/PersonalTokenAuthentication e
    marca o PersonalAccessToken correspondente como revogado. Sempre 204 —
    idempotente, "não achou" nunca é erro.
    """

    permission_classes = [AllowAny]

    def post(self, request: Request) -> Response:
        from contexts.identity.infrastructure.django.models import (
            PersonalAccessToken,
        )

        if not _check_internal_secret(request):
            return Response(status=status.HTTP_403_FORBIDDEN)

        serializer = OAuthRevokeByValueSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        digest = hash_token(serializer.validated_data["access_token"])

        token = PersonalAccessToken.objects.filter(
            token_hash=digest, revoked_at__isnull=True
        ).first()
        if token is not None:
            token.revoked_at = timezone.now()
            token.save(update_fields=["revoked_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)
