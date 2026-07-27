"""Endpoint público que recebe os eventos empurrados pelo Chatwoot.

Fica fora da autenticação de sessão — quem chama é a instância Chatwoot, não um
usuário logado. A autorização vem do segredo na própria URL (gerado por nós ao
conectar) e, quando o admin configura um secret no webhook, também do HMAC em
`X-Chatwoot-Signature`.
"""
from rest_framework.authentication import BaseAuthentication
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from contexts.chatwoot.application.use_cases.ingest_webhook import IngestWebhook
from contexts.chatwoot.infrastructure.django.repositories_impl import (
    DjangoConnectionRepository,
    DjangoWebhookEventRepository,
)


class ChatwootWebhookView(APIView):
    """POST /api/chatwoot/webhook/<secret>/ — chamado pela instância Chatwoot."""

    # Sem autenticação de usuário: zera as classes herdadas do settings para o
    # DRF não tentar validar JWT num request que nunca terá um.
    authentication_classes: list[type[BaseAuthentication]] = []
    permission_classes = [AllowAny]

    def post(self, request: Request, secret: str) -> Response:
        result = IngestWebhook(
            connections=DjangoConnectionRepository(),
            events=DjangoWebhookEventRepository(),
        ).execute(
            webhook_secret=secret,
            payload=request.data if isinstance(request.data, dict) else {},
            raw_body=request.body,
            signature=request.headers.get("X-Chatwoot-Signature"),
        )
        # Sempre 200 quando aceito: o Chatwoot desabilita webhooks que erram.
        return Response(result)
