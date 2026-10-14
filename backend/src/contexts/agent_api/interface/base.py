"""Base das views da API de agentes.

Autenticação, escopo, somente leitura e limite de taxa já foram resolvidos pelo
`AgentTokenMiddleware` — a view só lê. Erros saem no formato do Leonardo
(`{erro, mensagem}`), não no `{error}` do resto do Office."""
from rest_framework import exceptions
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from shared.domain.errors import NotFoundError, ValidationError


class AgentAPIView(APIView):
    authentication_classes: list = []
    permission_classes = [AllowAny]

    def handle_exception(self, exc):
        if isinstance(exc, ValidationError):
            return Response({"erro": "parametro_invalido", "mensagem": str(exc)}, status=400)
        if isinstance(exc, (NotFoundError, exceptions.NotFound)):
            return Response(
                {"erro": "nao_encontrado", "mensagem": str(exc) or "Não encontrado."},
                status=404,
            )
        return super().handle_exception(exc)

    @property
    def agent(self):
        return self.request._request.agent

    def workspace_ids(self) -> list:
        return list(self.agent.workspaces.values_list("id", flat=True))
