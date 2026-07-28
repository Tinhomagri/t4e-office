"""Views finas do contexto chatwoot (atendimento).

Todas seguem o mesmo rito: valida o acesso ao workspace → monta o gateway a
partir da conexão salva → chama o caso de uso → serializa. Nenhuma regra de
negócio mora aqui.
"""
from django.conf import settings
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from contexts.chatwoot.application.use_cases.browse_inbox import (
    FilterConversations,
    GetConversation,
    GetInboxCounts,
    ListConversations,
    ListMessages,
    LoadCatalog,
)
from contexts.chatwoot.application.use_cases.converse import (
    AssignConversation,
    ChangePriority,
    ChangeStatus,
    DeleteMessage,
    MarkConversationSeen,
    SendMessage,
    SetConversationAttributes,
    SetConversationLabels,
    SignalTyping,
    ToggleMute,
)
from contexts.chatwoot.application.use_cases.ingest_webhook import PollEvents
from contexts.chatwoot.application.use_cases.link_sales import (
    LinkConversationToDeal,
    ListCustomerConversations,
    ListDealConversations,
    UnlinkConversation,
)
from contexts.chatwoot.application.use_cases.manage_connection import (
    ConnectChatwoot,
    DisconnectChatwoot,
    GetConnection,
    VerifyConnection,
)
from contexts.chatwoot.application.use_cases.manage_contacts import (
    GetContact,
    GetContactConversations,
    SearchContacts,
    UpdateContact,
)
from contexts.chatwoot.infrastructure.django.repositories_impl import (
    DjangoConnectionRepository,
    DjangoConversationLinkRepository,
    DjangoWebhookEventRepository,
)
from contexts.chatwoot.infrastructure.gateway_factory import (
    gateway_for,
    gateway_for_workspace,
)
from contexts.chatwoot.interface.api.permissions import required_workspace
from contexts.chatwoot.interface.api.serializers import (
    AssignSerializer,
    AttributesSerializer,
    CatalogSerializer,
    ChangePrioritySerializer,
    ChangeStatusSerializer,
    ChatContactSerializer,
    ConnectionSerializer,
    ConnectSerializer,
    ConversationPageSerializer,
    ConversationSerializer,
    FilterSerializer,
    LabelsSerializer,
    LinkDealSerializer,
    MessageSerializer,
    SendMessageSerializer,
    WebhookEventSerializer,
)
from contexts.sales.infrastructure.django.models import CustomerModel, DealModel


# ── Fábricas de dependências ─────────────────────────────────────────────────
def _connections() -> DjangoConnectionRepository:
    return DjangoConnectionRepository()


def _links() -> DjangoConversationLinkRepository:
    return DjangoConversationLinkRepository()


def _events() -> DjangoWebhookEventRepository:
    return DjangoWebhookEventRepository()


def _connection_context() -> dict:
    """Contexto dos serializers de conexão: precisa da URL pública p/ o webhook."""
    return {"public_base_url": getattr(settings, "PUBLIC_BASE_URL", "")}


# ── Conexão ──────────────────────────────────────────────────────────────────
class ConnectionView(APIView):
    """GET/POST/DELETE da conexão Chatwoot do workspace."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses=ConnectionSerializer)
    def get(self, request: Request) -> Response:
        workspace_id = required_workspace(request)
        connection = GetConnection(connections=_connections()).execute(
            workspace_id=workspace_id
        )
        if connection is None:
            return Response({"connected": False, "connection": None})
        return Response(
            {
                "connected": connection.status == "connected",
                "connection": ConnectionSerializer(
                    connection, context=_connection_context()
                ).data,
            }
        )

    @extend_schema(request=ConnectSerializer, responses=ConnectionSerializer)
    def post(self, request: Request) -> Response:
        payload = ConnectSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data
        workspace_id = str(data["workspace_id"])
        # Mexer no token da instância inteira é coisa de admin.
        required_workspace(request, min_role="admin")

        connection = ConnectChatwoot(
            connections=_connections(), build_gateway=gateway_for
        ).execute(
            workspace_id=workspace_id,
            base_url=data["base_url"],
            account_id=data["account_id"],
            access_token=data.get("access_token", ""),
            user_id=str(request.user.id),
        )
        return Response(
            ConnectionSerializer(connection, context=_connection_context()).data,
            status=status.HTTP_201_CREATED,
        )

    def delete(self, request: Request) -> Response:
        workspace_id = required_workspace(request, min_role="admin")
        DisconnectChatwoot(connections=_connections()).execute(workspace_id=workspace_id)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ConnectionTestView(APIView):
    """Revalida o token sem alterar nada."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses=ConnectionSerializer)
    def post(self, request: Request) -> Response:
        workspace_id = required_workspace(request, min_role="admin")
        connection = VerifyConnection(
            connections=_connections(), build_gateway=gateway_for
        ).execute(workspace_id=workspace_id)
        return Response(ConnectionSerializer(connection, context=_connection_context()).data)


# ── Catálogo ─────────────────────────────────────────────────────────────────
class CatalogView(APIView):
    """Caixas, agentes, times, etiquetas e respostas prontas numa tacada."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses=CatalogSerializer)
    def get(self, request: Request) -> Response:
        workspace_id = required_workspace(request)
        _, gateway = gateway_for_workspace(workspace_id)
        catalog = LoadCatalog(gateway=gateway).execute()
        return Response(CatalogSerializer(catalog).data)


# ── Conversas ────────────────────────────────────────────────────────────────
def _int_param(request, name: str) -> int | None:
    raw = request.query_params.get(name)
    try:
        return int(raw) if raw else None
    except ValueError:
        return None


class ConversationListView(APIView):
    """Lista conversas com os filtros da caixa de entrada."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses=ConversationPageSerializer)
    def get(self, request: Request) -> Response:
        workspace_id = required_workspace(request)
        _, gateway = gateway_for_workspace(workspace_id)
        labels = request.query_params.getlist("labels") or None
        page, link_map = ListConversations(gateway=gateway, links=_links()).execute(
            workspace_id=workspace_id,
            status=request.query_params.get("status") or None,
            assignee_type=request.query_params.get("assignee_type") or None,
            inbox_id=_int_param(request, "inbox_id"),
            team_id=_int_param(request, "team_id"),
            labels=labels,
            query=request.query_params.get("q") or None,
            page=_int_param(request, "page") or 1,
        )
        return Response(
            ConversationPageSerializer(page, context={"link_map": link_map}).data
        )


class ConversationFilterView(APIView):
    """Busca avançada com o payload de filtros do Chatwoot."""

    permission_classes = [IsAuthenticated]

    @extend_schema(request=FilterSerializer, responses=ConversationPageSerializer)
    def post(self, request: Request) -> Response:
        workspace_id = required_workspace(request)
        body = FilterSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        _, gateway = gateway_for_workspace(workspace_id)
        page, link_map = FilterConversations(gateway=gateway, links=_links()).execute(
            workspace_id=workspace_id,
            payload=body.validated_data["payload"],
            page=_int_param(request, "page") or 1,
        )
        return Response(
            ConversationPageSerializer(page, context={"link_map": link_map}).data
        )


class ConversationCountsView(APIView):
    """Badges das pastas (minhas / não atribuídas / todas)."""

    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        workspace_id = required_workspace(request)
        _, gateway = gateway_for_workspace(workspace_id)
        return Response(GetInboxCounts(gateway=gateway).execute())


class ConversationDetailView(APIView):
    """Detalhe de uma conversa (com histórico de mensagens)."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses=ConversationSerializer)
    def get(self, request: Request, conversation_id: int) -> Response:
        workspace_id = required_workspace(request)
        _, gateway = gateway_for_workspace(workspace_id)
        conversation, link = GetConversation(gateway=gateway, links=_links()).execute(
            workspace_id=workspace_id, conversation_id=conversation_id
        )
        return Response(
            ConversationSerializer(
                conversation, context={"link_map": {conversation_id: link}}
            ).data
        )


class ConversationMessagesView(APIView):
    """Histórico + envio de mensagem/nota interna."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses=MessageSerializer(many=True))
    def get(self, request: Request, conversation_id: int) -> Response:
        workspace_id = required_workspace(request)
        _, gateway = gateway_for_workspace(workspace_id)
        messages = ListMessages(gateway=gateway).execute(
            conversation_id=conversation_id, before=_int_param(request, "before")
        )
        return Response(MessageSerializer(messages, many=True).data)

    @extend_schema(request=SendMessageSerializer, responses=MessageSerializer)
    def post(self, request: Request, conversation_id: int) -> Response:
        workspace_id = required_workspace(request)
        body = SendMessageSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        _, gateway = gateway_for_workspace(workspace_id)
        message = SendMessage(gateway=gateway).execute(
            conversation_id=conversation_id,
            content=data["content"],
            private=data["private"],
            content_type=data.get("content_type", "text"),
            content_attributes=data.get("content_attributes"),
            template_params=data.get("template_params"),
        )
        return Response(MessageSerializer(message).data, status=status.HTTP_201_CREATED)


class MessageDetailView(APIView):
    """Apagar mensagem enviada por engano."""

    permission_classes = [IsAuthenticated]

    def delete(self, request: Request, conversation_id: int, message_id: int) -> Response:
        workspace_id = required_workspace(request)
        _, gateway = gateway_for_workspace(workspace_id)
        DeleteMessage(gateway=gateway).execute(
            conversation_id=conversation_id, message_id=message_id
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class ConversationStatusView(APIView):
    """Abrir / resolver / pendente / adiar."""

    permission_classes = [IsAuthenticated]

    @extend_schema(request=ChangeStatusSerializer)
    def post(self, request: Request, conversation_id: int) -> Response:
        workspace_id = required_workspace(request)
        body = ChangeStatusSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        _, gateway = gateway_for_workspace(workspace_id)
        result = ChangeStatus(gateway=gateway).execute(
            conversation_id=conversation_id,
            status=body.validated_data["status"],
            snoozed_until=body.validated_data.get("snoozed_until") or None,
        )
        return Response(result)


class ConversationPriorityView(APIView):
    """Define ou limpa a prioridade."""

    permission_classes = [IsAuthenticated]

    @extend_schema(request=ChangePrioritySerializer)
    def post(self, request: Request, conversation_id: int) -> Response:
        workspace_id = required_workspace(request)
        body = ChangePrioritySerializer(data=request.data)
        body.is_valid(raise_exception=True)
        _, gateway = gateway_for_workspace(workspace_id)
        result = ChangePriority(gateway=gateway).execute(
            conversation_id=conversation_id,
            priority=body.validated_data.get("priority"),
        )
        return Response(result)


class ConversationAssignView(APIView):
    """Atribui a agente ou time (sem corpo = desatribui)."""

    permission_classes = [IsAuthenticated]

    @extend_schema(request=AssignSerializer)
    def post(self, request: Request, conversation_id: int) -> Response:
        workspace_id = required_workspace(request)
        body = AssignSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        _, gateway = gateway_for_workspace(workspace_id)
        result = AssignConversation(gateway=gateway).execute(
            conversation_id=conversation_id,
            assignee_id=body.validated_data.get("assignee_id"),
            team_id=body.validated_data.get("team_id"),
        )
        return Response(result)


class ConversationLabelsView(APIView):
    """Substitui as etiquetas da conversa."""

    permission_classes = [IsAuthenticated]

    @extend_schema(request=LabelsSerializer)
    def post(self, request: Request, conversation_id: int) -> Response:
        workspace_id = required_workspace(request)
        body = LabelsSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        _, gateway = gateway_for_workspace(workspace_id)
        labels = SetConversationLabels(gateway=gateway).execute(
            conversation_id=conversation_id, labels=body.validated_data["labels"]
        )
        return Response({"labels": labels})


class ConversationAttributesView(APIView):
    """Grava campos personalizados na conversa."""

    permission_classes = [IsAuthenticated]

    @extend_schema(request=AttributesSerializer)
    def post(self, request: Request, conversation_id: int) -> Response:
        workspace_id = required_workspace(request)
        body = AttributesSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        _, gateway = gateway_for_workspace(workspace_id)
        attributes = SetConversationAttributes(gateway=gateway).execute(
            conversation_id=conversation_id,
            attributes=body.validated_data["custom_attributes"],
        )
        return Response({"custom_attributes": attributes})


class ConversationMuteView(APIView):
    """Silencia (POST) ou reativa (DELETE) a conversa."""

    permission_classes = [IsAuthenticated]

    def post(self, request: Request, conversation_id: int) -> Response:
        workspace_id = required_workspace(request)
        _, gateway = gateway_for_workspace(workspace_id)
        return Response(
            ToggleMute(gateway=gateway).execute(conversation_id=conversation_id, muted=True)
        )

    def delete(self, request: Request, conversation_id: int) -> Response:
        workspace_id = required_workspace(request)
        _, gateway = gateway_for_workspace(workspace_id)
        return Response(
            ToggleMute(gateway=gateway).execute(conversation_id=conversation_id, muted=False)
        )


class ConversationTypingView(APIView):
    """Propaga "digitando…" para o widget do cliente."""

    permission_classes = [IsAuthenticated]

    def post(self, request: Request, conversation_id: int) -> Response:
        workspace_id = required_workspace(request)
        _, gateway = gateway_for_workspace(workspace_id)
        SignalTyping(gateway=gateway).execute(
            conversation_id=conversation_id,
            typing_on=bool(request.data.get("typing_on", True)),
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class ConversationSeenView(APIView):
    """Marca como lida ao abrir."""

    permission_classes = [IsAuthenticated]

    def post(self, request: Request, conversation_id: int) -> Response:
        workspace_id = required_workspace(request)
        _, gateway = gateway_for_workspace(workspace_id)
        MarkConversationSeen(gateway=gateway).execute(conversation_id=conversation_id)
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── Ponte com o funil ────────────────────────────────────────────────────────
class ConversationLinkView(APIView):
    """Vincula/desvincula a conversa a um negócio ou cliente do funil."""

    permission_classes = [IsAuthenticated]

    @extend_schema(request=LinkDealSerializer)
    def post(self, request: Request, conversation_id: int) -> Response:
        workspace_id = required_workspace(request)
        body = LinkDealSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        _, gateway = gateway_for_workspace(workspace_id)
        deal_id = body.validated_data.get("deal_id")
        customer_id = body.validated_data.get("customer_id")
        result = LinkConversationToDeal(
            links=_links(),
            gateway=gateway,
            deals=DealModel.objects,
            customers=CustomerModel.objects,
        ).execute(
            workspace_id=workspace_id,
            conversation_id=conversation_id,
            deal_id=str(deal_id) if deal_id else None,
            customer_id=str(customer_id) if customer_id else None,
            user_id=str(request.user.id),
        )
        return Response(result, status=status.HTTP_201_CREATED)

    def delete(self, request: Request, conversation_id: int) -> Response:
        workspace_id = required_workspace(request)
        _, gateway = gateway_for_workspace(workspace_id)
        UnlinkConversation(links=_links(), gateway=gateway).execute(
            workspace_id=workspace_id, conversation_id=conversation_id
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class DealConversationsView(APIView):
    """Conversas de um negócio — aba Atendimento do DealDrawer."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses=ConversationSerializer(many=True))
    def get(self, request: Request, deal_id: str) -> Response:
        workspace_id = required_workspace(request)
        _, gateway = gateway_for_workspace(workspace_id)
        conversations = ListDealConversations(links=_links(), gateway=gateway).execute(
            deal_id=str(deal_id)
        )
        return Response(
            ConversationSerializer(conversations, many=True, context={"link_map": {}}).data
        )


class CustomerConversationsView(APIView):
    """Conversas de um cliente — ficha do cliente."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses=ConversationSerializer(many=True))
    def get(self, request: Request, customer_id: str) -> Response:
        workspace_id = required_workspace(request)
        _, gateway = gateway_for_workspace(workspace_id)
        conversations = ListCustomerConversations(links=_links(), gateway=gateway).execute(
            customer_id=str(customer_id)
        )
        return Response(
            ConversationSerializer(conversations, many=True, context={"link_map": {}}).data
        )


# ── Contatos ─────────────────────────────────────────────────────────────────
class ContactListView(APIView):
    """Busca de contatos do Chatwoot."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses=ChatContactSerializer(many=True))
    def get(self, request: Request) -> Response:
        workspace_id = required_workspace(request)
        _, gateway = gateway_for_workspace(workspace_id)
        contacts = SearchContacts(gateway=gateway).execute(
            query=request.query_params.get("q", ""),
            page=_int_param(request, "page") or 1,
        )
        return Response(ChatContactSerializer(contacts, many=True).data)


class ContactDetailView(APIView):
    """Ficha do contato + edição inline pelo painel lateral."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses=ChatContactSerializer)
    def get(self, request: Request, contact_id: int) -> Response:
        workspace_id = required_workspace(request)
        _, gateway = gateway_for_workspace(workspace_id)
        contact = GetContact(gateway=gateway).execute(contact_id=contact_id)
        return Response(ChatContactSerializer(contact).data)

    @extend_schema(responses=ChatContactSerializer)
    def patch(self, request: Request, contact_id: int) -> Response:
        workspace_id = required_workspace(request)
        _, gateway = gateway_for_workspace(workspace_id)
        payload = {k: v for k, v in request.data.items() if k != "workspace_id"}
        contact = UpdateContact(gateway=gateway).execute(
            contact_id=contact_id, payload=payload
        )
        return Response(ChatContactSerializer(contact).data)


class ContactConversationsView(APIView):
    """Conversas anteriores do mesmo contato."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses=ConversationSerializer(many=True))
    def get(self, request: Request, contact_id: int) -> Response:
        workspace_id = required_workspace(request)
        _, gateway = gateway_for_workspace(workspace_id)
        conversations = GetContactConversations(gateway=gateway).execute(
            contact_id=contact_id
        )
        return Response(
            ConversationSerializer(conversations, many=True, context={"link_map": {}}).data
        )


# ── Tempo real (polling dos eventos do webhook) ──────────────────────────────
class EventStreamView(APIView):
    """Eventos novos desde o cursor — o frontend chama em intervalo curto."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses=WebhookEventSerializer(many=True))
    def get(self, request: Request) -> Response:
        workspace_id = required_workspace(request)
        events = PollEvents(events=_events()).execute(
            workspace_id=workspace_id,
            after_id=request.query_params.get("after") or None,
            limit=min(_int_param(request, "limit") or 50, 200),
        )
        data = WebhookEventSerializer(
            [
                {
                    "id": str(e.id),
                    "event": e.event,
                    "conversation_id": e.conversation_id,
                    "contact_id": e.contact_id,
                    "created_at": e.created_at,
                }
                for e in events
            ],
            many=True,
        ).data
        # `cursor` é o evento mais novo desta leva — o cliente devolve no `after`.
        return Response({"events": data, "cursor": data[0]["id"] if data else None})
