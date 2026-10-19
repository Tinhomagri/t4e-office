"""Tela "Chaves de API" (Membros & Permissões): admin do workspace gera,
lista e revoga chaves de agente. Rotas normais do Office (login de usuário),
fora do prefixo da API de agentes.

A chave aparece UMA vez, na resposta da criação; listagem nunca a devolve."""
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from contexts.agent_api.application.tokens import create_key
from contexts.agent_api.infrastructure.models import AgentTokenModel
from contexts.identity.infrastructure.django.models import MembershipModel, WorkspaceModel
from shared.domain.errors import NotFoundError, PermissionDeniedError, ValidationError


def _workspace_as_admin(workspace_id, user_id) -> WorkspaceModel:
    role = (
        MembershipModel.objects.filter(workspace_id=workspace_id, user_id=user_id)
        .values_list("role", flat=True)
        .first()
    )
    if role not in ("owner", "admin"):
        raise PermissionDeniedError("Só owner ou admin do workspace gerencia chaves de API.")
    return WorkspaceModel.objects.get(id=workspace_id)


def _ser(agent: AgentTokenModel) -> dict:
    return {
        "id": agent.id,
        "nome": agent.nome or agent.id,
        "ativo": agent.ativo,
        "criado_em": agent.criado_em.isoformat(),
        "ultimo_uso": agent.ultimo_uso.isoformat() if agent.ultimo_uso else None,
        "criado_por": agent.criado_por.full_name if agent.criado_por else None,
    }


class AgentKeyListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request, workspace_id) -> Response:
        ws = _workspace_as_admin(workspace_id, request.user.id)
        keys = (
            AgentTokenModel.objects.filter(workspaces=ws)
            .select_related("criado_por")
            .order_by("-ativo", "-criado_em")
        )
        return Response([_ser(k) for k in keys])

    def post(self, request: Request, workspace_id) -> Response:
        ws = _workspace_as_admin(workspace_id, request.user.id)
        nome = str(request.data.get("nome") or "").strip()
        if not nome:
            raise ValidationError("Dê um nome para a chave (ex.: quem vai usar).")
        agent, chave = create_key(workspace=ws, nome=nome[:120], actor=request.user)
        return Response({**_ser(agent), "chave": chave}, status=201)


class AgentKeyRevokeView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request: Request, workspace_id, key_id: str) -> Response:
        ws = _workspace_as_admin(workspace_id, request.user.id)
        # Revogar = desativar: a auditoria continua apontando para a chave.
        updated = AgentTokenModel.objects.filter(id=key_id, workspaces=ws).update(ativo=False)
        if not updated:
            raise NotFoundError("Chave não encontrada.")
        return Response(status=204)
