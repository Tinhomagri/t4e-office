"""Views finas do Google Chat — orquestram os casos de uso de chat.py."""
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from contexts.google.application.use_cases.chat import (
    CreateChatDm,
    ListChatMessages,
    ListChatSpaces,
    SendChatMessage,
)
from contexts.google.application.use_cases.get_valid_credentials import (
    GetValidCredentials,
)
from contexts.google.domain.ports.chat_gateway import ChatError
from contexts.google.infrastructure.django.chat_gateway_impl import GoogleChatGateway
from contexts.google.infrastructure.django.oauth_provider_impl import (
    GoogleOAuthProvider,
)
from contexts.google.infrastructure.django.repositories_impl import (
    DjangoConnectionRepository,
)
from contexts.google.interface.api.serializers import (
    ChatMessageSerializer,
    ChatSpaceSerializer,
    CreateChatDmSerializer,
    SendChatMessageSerializer,
)


def _credentials_use_case() -> GetValidCredentials:
    return GetValidCredentials(
        oauth_provider=GoogleOAuthProvider(),
        connection_repository=DjangoConnectionRepository(),
    )


def _chat_error_response() -> Response:
    return Response(
        {
            "error": "Falha ao falar com o Google Chat. Se você conectou o Google antes "
            "do Chat existir no app, desconecte e conecte de novo pra liberar o escopo."
        },
        status=status.HTTP_502_BAD_GATEWAY,
    )


class ChatSpaceListView(APIView):
    """GET /google/chat/spaces/ — DMs e grupos do usuário."""

    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        try:
            spaces = ListChatSpaces(
                chat_gateway=GoogleChatGateway(),
                get_valid_credentials=_credentials_use_case(),
            ).execute(user_id=str(request.user.id))
        except ChatError:
            return _chat_error_response()
        return Response(ChatSpaceSerializer(spaces, many=True).data)


class ChatDmCreateView(APIView):
    """POST /google/chat/spaces/dm/ — cria (ou recupera) DM com um e-mail."""

    permission_classes = [IsAuthenticated]

    def post(self, request: Request) -> Response:
        serializer = CreateChatDmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            space = CreateChatDm(
                chat_gateway=GoogleChatGateway(),
                get_valid_credentials=_credentials_use_case(),
            ).execute(
                user_id=str(request.user.id),
                member_email=serializer.validated_data["member_email"],
            )
        except ChatError:
            return _chat_error_response()
        return Response(ChatSpaceSerializer(space).data, status=status.HTTP_201_CREATED)


class ChatMessageListView(APIView):
    """GET lista / POST envia mensagens de um espaço.

    `space_id` chega urlencoded (ex.: "spaces%2FAAA") porque o nome do recurso
    do Chat tem barra — o DRF já decodifica antes de cair no path param.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request: Request, space_id: str) -> Response:
        try:
            messages = ListChatMessages(
                chat_gateway=GoogleChatGateway(),
                get_valid_credentials=_credentials_use_case(),
            ).execute(user_id=str(request.user.id), space_id=space_id)
        except ChatError:
            return _chat_error_response()
        return Response(ChatMessageSerializer(messages, many=True).data)

    def post(self, request: Request, space_id: str) -> Response:
        serializer = SendChatMessageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            message = SendChatMessage(
                chat_gateway=GoogleChatGateway(),
                get_valid_credentials=_credentials_use_case(),
            ).execute(
                user_id=str(request.user.id),
                space_id=space_id,
                text=serializer.validated_data["text"],
            )
        except ChatError:
            return _chat_error_response()
        return Response(ChatMessageSerializer(message).data, status=status.HTTP_201_CREATED)
