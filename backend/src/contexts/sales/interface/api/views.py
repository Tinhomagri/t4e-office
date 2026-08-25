"""Views finas do contexto sales (comercial)."""
from decimal import Decimal

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from contexts.projects.domain.repositories.project_repository import (
    WorkspaceAccess as ProjectsWorkspaceAccess,
)
from contexts.projects.infrastructure.django.repositories_impl import (
    DjangoProjectRepository,
)
from shared.interface.permissions import SpaceAccessPermission, require_space
from contexts.sales.application.use_cases.lose_deal import LoseDeal
from contexts.sales.application.use_cases.manage_customers import (
    CreateContact,
    CreateCustomer,
    DeleteContact,
    DeleteCustomer,
    GetCustomer,
    ListContacts,
    ListCustomers,
    UpdateContact,
    UpdateCustomer,
)
from contexts.sales.application.use_cases.manage_deals import (
    CreateDeal,
    DeleteDeal,
    GetDeal,
    ListDealHistory,
    ListDeals,
    UpdateDeal,
)
from contexts.sales.application.use_cases.manage_stages import (
    CreateStage,
    DeleteStage,
    ListStages,
    UpdateStage,
)
from contexts.sales.application.use_cases.move_deal_stage import MoveDealStage
from contexts.sales.application.use_cases.schedule_activity import (
    DeleteActivity,
    ListActivities,
    ListWorkspaceActivities,
    ScheduleActivity,
    UpdateActivity,
)
from contexts.sales.application.use_cases.win_deal import WinDeal
from contexts.sales.infrastructure.adapters.meeting_scheduler_impl import (
    GoogleMeetingScheduler,
)
from contexts.sales.infrastructure.adapters.project_creator_impl import (
    ProjectsProjectCreator,
)
from contexts.sales.infrastructure.django.repositories_impl import (
    DjangoActivityRepository,
    DjangoContactRepository,
    DjangoCustomerRepository,
    DjangoDealHistoryRepository,
    DjangoDealRepository,
    DjangoStageRepository,
    DjangoWorkspaceAccess,
)
from contexts.sales.interface.api.permissions import assert_workspace_member
from contexts.sales.interface.api.serializers import (
    ActivitySerializer,
    ContactSerializer,
    CreateActivitySerializer,
    CreateContactSerializer,
    CreateCustomerSerializer,
    CreateDealSerializer,
    CreateStageSerializer,
    CustomerSerializer,
    DealHistorySerializer,
    DealSerializer,
    LoseDealSerializer,
    MoveDealStageSerializer,
    StageSerializer,
    UpdateActivitySerializer,
    UpdateContactSerializer,
    UpdateCustomerSerializer,
    UpdateDealSerializer,
    UpdateStageSerializer,
    WinDealSerializer,
)

# ── Fábricas de dependências ─────────────────────────────────────────────────

def _uid(request: Request) -> str:
    return str(request.user.id)


def _workspace_access() -> DjangoWorkspaceAccess:
    return DjangoWorkspaceAccess()


def _project_creator() -> ProjectsProjectCreator:
    """Adaptador de criação do projeto de entrega (fronteira com `projects`)."""

    class _Access(ProjectsWorkspaceAccess):
        """Reusa a checagem de membro do contexto sales para o contrato de projects."""

        def is_member(self, *, workspace_id: str, user_id: str) -> bool:
            return DjangoWorkspaceAccess().is_member(
                workspace_id=workspace_id, user_id=user_id
            )

    return ProjectsProjectCreator(
        project_repository=DjangoProjectRepository(), workspace_access=_Access()
    )


# ── Serialização de entidades → dicionários ──────────────────────────────────

def _ser_customer(c) -> dict:
    return {
        "id": str(c.id),
        "workspace_id": str(c.workspace_id),
        "name": c.name,
        "kind": c.kind.value,
        "legal_name": c.legal_name,
        "document": c.document,
        "email": c.email,
        "phone": c.phone,
        "website": c.website,
        "notes": c.notes,
        "owner_id": c.owner_id,
    }


def _ser_contact(c) -> dict:
    return {
        "id": str(c.id),
        "customer_id": str(c.customer_id),
        "name": c.name,
        "role": c.role,
        "email": c.email,
        "phone": c.phone,
        "is_primary": c.is_primary,
    }


def _ser_stage(s) -> dict:
    return {
        "id": str(s.id),
        "workspace_id": str(s.workspace_id),
        "name": s.name,
        "slug": s.slug,
        "color": s.color,
        "order": s.order,
        "probability_default": s.probability_default,
        "kind": s.kind.value,
    }


def _ser_deal(d) -> dict:
    return {
        "id": str(d.id),
        "workspace_id": str(d.workspace_id),
        "title": d.title,
        "customer_id": str(d.customer_id),
        # Denormalizado: o card do Kanban precisa do nome sem uma segunda requisição
        "customer_name": d.customer_name,
        "contact_id": d.contact_id,
        "stage_id": str(d.stage_id),
        "amount": str(d.amount),
        "currency": d.currency,
        "probability": d.probability,
        "weighted_amount": str(d.weighted_amount),
        "expected_close_date": d.expected_close_date,
        "source": d.source,
        "owner_id": d.owner_id,
        "lost_reason": d.lost_reason,
        "lost_notes": d.lost_notes,
        "won_at": d.won_at,
        "lost_at": d.lost_at,
        "delivery_project_id": d.delivery_project_id,
        "rank": d.rank,
    }


def _ser_activity(a) -> dict:
    return {
        "id": str(a.id),
        "deal_id": str(a.deal_id),
        "kind": a.kind.value,
        "content": a.content,
        "author_id": a.author_id,
        "due_date": a.due_date,
        "end_date": a.end_date,
        "assignee_id": a.assignee_id,
        "done_at": a.done_at,
        "google_event_id": a.google_event_id,
        "meet_url": a.meet_url,
        "created_at": a.created_at,
        "author_name": a.author_name,
        "deal_title": a.deal_title,
    }


def _ser_history(h) -> dict:
    return {
        "id": str(h.id),
        "deal_id": str(h.deal_id),
        "author_id": h.author_id,
        "author_name": h.author_name,
        "field": h.field,
        "from_value": h.from_value,
        "to_value": h.to_value,
        "created_at": h.created_at,
    }


def _require_workspace(request: Request) -> str | None:
    """Extrai `workspace_id` da query string (None quando ausente)."""
    return request.query_params.get("workspace_id")


# ── Clientes ─────────────────────────────────────────────────────────────────

class CustomerListCreateView(APIView):
    """Lista e cria clientes dentro de um workspace."""

    permission_classes = [IsAuthenticated, SpaceAccessPermission]
    required_space = "comercial"

    @extend_schema(responses=CustomerSerializer(many=True))
    def get(self, request: Request) -> Response:
        workspace_id = _require_workspace(request)
        if not workspace_id:
            return Response(
                {"error": "Informe o parâmetro workspace_id."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        customers = ListCustomers(
            DjangoCustomerRepository(), _workspace_access()
        ).execute(
            workspace_id=workspace_id,
            actor_id=_uid(request),
            search=request.query_params.get("search", ""),
        )
        return Response([_ser_customer(c) for c in customers])

    @extend_schema(request=CreateCustomerSerializer, responses=CustomerSerializer)
    def post(self, request: Request) -> Response:
        serializer = CreateCustomerSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        workspace_id = data.pop("workspace_id")
        customer = CreateCustomer(
            DjangoCustomerRepository(), _workspace_access()
        ).execute(workspace_id=workspace_id, actor_id=_uid(request), **data)
        return Response(_ser_customer(customer), status=status.HTTP_201_CREATED)


class CustomerDetailView(APIView):
    """Detalha, atualiza e remove um cliente."""

    permission_classes = [IsAuthenticated, SpaceAccessPermission]
    required_space = "comercial"

    @extend_schema(responses=CustomerSerializer)
    def get(self, request: Request, customer_id: str) -> Response:
        customer = GetCustomer(
            DjangoCustomerRepository(), _workspace_access()
        ).execute(customer_id=str(customer_id), actor_id=_uid(request))
        require_space(workspace_id=str(customer.workspace_id), user_id=_uid(request), space="comercial")
        return Response(_ser_customer(customer))

    @extend_schema(request=UpdateCustomerSerializer, responses=CustomerSerializer)
    def patch(self, request: Request, customer_id: str) -> Response:
        serializer = UpdateCustomerSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        customer = UpdateCustomer(
            DjangoCustomerRepository(), _workspace_access()
        ).execute(
            customer_id=str(customer_id),
            actor_id=_uid(request),
            **serializer.validated_data,
        )
        require_space(workspace_id=str(customer.workspace_id), user_id=_uid(request), space="comercial")
        return Response(_ser_customer(customer))

    def delete(self, request: Request, customer_id: str) -> Response:
        # Fetch customer before delete to check space access
        customer = GetCustomer(
            DjangoCustomerRepository(), _workspace_access()
        ).execute(customer_id=str(customer_id), actor_id=_uid(request))
        require_space(workspace_id=str(customer.workspace_id), user_id=_uid(request), space="comercial")
        DeleteCustomer(DjangoCustomerRepository(), _workspace_access()).execute(
            customer_id=str(customer_id), actor_id=_uid(request)
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class ContactListCreateView(APIView):
    """Lista e cria contatos de um cliente."""

    permission_classes = [IsAuthenticated, SpaceAccessPermission]
    required_space = "comercial"

    @extend_schema(responses=ContactSerializer(many=True))
    def get(self, request: Request, customer_id: str) -> Response:
        customer = GetCustomer(
            DjangoCustomerRepository(), _workspace_access()
        ).execute(customer_id=str(customer_id), actor_id=_uid(request))
        require_space(workspace_id=str(customer.workspace_id), user_id=_uid(request), space="comercial")
        contacts = ListContacts(
            DjangoContactRepository(), DjangoCustomerRepository(), _workspace_access()
        ).execute(customer_id=str(customer_id), actor_id=_uid(request))
        return Response([_ser_contact(c) for c in contacts])

    @extend_schema(request=CreateContactSerializer, responses=ContactSerializer)
    def post(self, request: Request, customer_id: str) -> Response:
        customer = GetCustomer(
            DjangoCustomerRepository(), _workspace_access()
        ).execute(customer_id=str(customer_id), actor_id=_uid(request))
        require_space(workspace_id=str(customer.workspace_id), user_id=_uid(request), space="comercial")
        serializer = CreateContactSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        contact = CreateContact(
            DjangoContactRepository(), DjangoCustomerRepository(), _workspace_access()
        ).execute(
            customer_id=str(customer_id),
            actor_id=_uid(request),
            **serializer.validated_data,
        )
        return Response(_ser_contact(contact), status=status.HTTP_201_CREATED)


class ContactDetailView(APIView):
    """Atualiza e remove um contato."""

    permission_classes = [IsAuthenticated, SpaceAccessPermission]
    required_space = "comercial"

    @extend_schema(request=UpdateContactSerializer, responses=ContactSerializer)
    def patch(self, request: Request, contact_id: str) -> Response:
        serializer = UpdateContactSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        contact = UpdateContact(
            DjangoContactRepository(), DjangoCustomerRepository(), _workspace_access()
        ).execute(
            contact_id=str(contact_id),
            actor_id=_uid(request),
            **serializer.validated_data,
        )
        # Check space access via the contact's customer
        customer = GetCustomer(
            DjangoCustomerRepository(), _workspace_access()
        ).execute(customer_id=str(contact.customer_id), actor_id=_uid(request))
        require_space(workspace_id=str(customer.workspace_id), user_id=_uid(request), space="comercial")
        return Response(_ser_contact(contact))

    def delete(self, request: Request, contact_id: str) -> Response:
        # Space access check is done in the use case via the customer it accesses
        DeleteContact(
            DjangoContactRepository(), DjangoCustomerRepository(), _workspace_access()
        ).execute(contact_id=str(contact_id), actor_id=_uid(request))
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── Estágios do funil ────────────────────────────────────────────────────────

class StageListCreateView(APIView):
    """Lista (semeando o padrão) e cria estágios do funil."""

    permission_classes = [IsAuthenticated, SpaceAccessPermission]
    required_space = "comercial"

    @extend_schema(responses=StageSerializer(many=True))
    def get(self, request: Request) -> Response:
        workspace_id = _require_workspace(request)
        if not workspace_id:
            return Response(
                {"error": "Informe o parâmetro workspace_id."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        stages = ListStages(DjangoStageRepository(), _workspace_access()).execute(
            workspace_id=workspace_id, actor_id=_uid(request)
        )
        return Response([_ser_stage(s) for s in sorted(stages, key=lambda s: s.order)])

    @extend_schema(request=CreateStageSerializer, responses=StageSerializer)
    def post(self, request: Request) -> Response:
        serializer = CreateStageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        workspace_id = data.pop("workspace_id")
        stage = CreateStage(DjangoStageRepository(), _workspace_access()).execute(
            workspace_id=workspace_id, actor_id=_uid(request), **data
        )
        return Response(_ser_stage(stage), status=status.HTTP_201_CREATED)


class StageDetailView(APIView):
    """Atualiza e remove um estágio do funil."""

    permission_classes = [IsAuthenticated, SpaceAccessPermission]
    required_space = "comercial"

    @extend_schema(request=UpdateStageSerializer, responses=StageSerializer)
    def patch(self, request: Request, stage_id: str) -> Response:
        serializer = UpdateStageSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        stage = UpdateStage(DjangoStageRepository(), _workspace_access()).execute(
            stage_id=str(stage_id), actor_id=_uid(request), **serializer.validated_data
        )
        require_space(workspace_id=str(stage.workspace_id), user_id=_uid(request), space="comercial")
        return Response(_ser_stage(stage))

    def delete(self, request: Request, stage_id: str) -> Response:
        # Space access check is done in the use case
        DeleteStage(
            DjangoStageRepository(), DjangoDealRepository(), _workspace_access()
        ).execute(stage_id=str(stage_id), actor_id=_uid(request))
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── Negócios ─────────────────────────────────────────────────────────────────

class DealListCreateView(APIView):
    """Lista e cria negócios do funil."""

    permission_classes = [IsAuthenticated, SpaceAccessPermission]
    required_space = "comercial"

    @extend_schema(responses=DealSerializer(many=True))
    def get(self, request: Request) -> Response:
        workspace_id = _require_workspace(request)
        if not workspace_id:
            return Response(
                {"error": "Informe o parâmetro workspace_id."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        deals = ListDeals(DjangoDealRepository(), _workspace_access()).execute(
            workspace_id=workspace_id,
            actor_id=_uid(request),
            stage_id=request.query_params.get("stage_id"),
            customer_id=request.query_params.get("customer_id"),
            owner_id=request.query_params.get("owner_id"),
        )
        return Response([_ser_deal(d) for d in deals])

    @extend_schema(request=CreateDealSerializer, responses=DealSerializer)
    def post(self, request: Request) -> Response:
        serializer = CreateDealSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        workspace_id = data.pop("workspace_id")
        deal = CreateDeal(
            DjangoDealRepository(),
            DjangoStageRepository(),
            DjangoCustomerRepository(),
            _workspace_access(),
        ).execute(workspace_id=workspace_id, actor_id=_uid(request), **data)
        return Response(_ser_deal(deal), status=status.HTTP_201_CREATED)


class DealDetailView(APIView):
    """Detalha, atualiza e remove um negócio."""

    permission_classes = [IsAuthenticated, SpaceAccessPermission]
    required_space = "comercial"

    @extend_schema(responses=DealSerializer)
    def get(self, request: Request, deal_id: str) -> Response:
        deal = GetDeal(DjangoDealRepository(), _workspace_access()).execute(
            deal_id=str(deal_id), actor_id=_uid(request)
        )
        require_space(workspace_id=str(deal.workspace_id), user_id=_uid(request), space="comercial")
        return Response(_ser_deal(deal))

    @extend_schema(request=UpdateDealSerializer, responses=DealSerializer)
    def patch(self, request: Request, deal_id: str) -> Response:
        serializer = UpdateDealSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        deal = UpdateDeal(
            DjangoDealRepository(), _workspace_access(), DjangoDealHistoryRepository()
        ).execute(
            deal_id=str(deal_id), actor_id=_uid(request), **serializer.validated_data
        )
        require_space(workspace_id=str(deal.workspace_id), user_id=_uid(request), space="comercial")
        return Response(_ser_deal(deal))

    def delete(self, request: Request, deal_id: str) -> Response:
        # Fetch deal before delete to check space access
        deal = GetDeal(DjangoDealRepository(), _workspace_access()).execute(
            deal_id=str(deal_id), actor_id=_uid(request)
        )
        require_space(workspace_id=str(deal.workspace_id), user_id=_uid(request), space="comercial")
        DeleteDeal(DjangoDealRepository(), _workspace_access()).execute(
            deal_id=str(deal_id), actor_id=_uid(request)
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class DealMoveView(APIView):
    """Move o negócio de estágio no funil."""

    permission_classes = [IsAuthenticated, SpaceAccessPermission]
    required_space = "comercial"

    @extend_schema(request=MoveDealStageSerializer, responses=DealSerializer)
    def post(self, request: Request, deal_id: str) -> Response:
        serializer = MoveDealStageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        deal = MoveDealStage(
            DjangoDealRepository(),
            DjangoStageRepository(),
            _workspace_access(),
            DjangoDealHistoryRepository(),
        ).execute(
            deal_id=str(deal_id), actor_id=_uid(request), **serializer.validated_data
        )
        require_space(workspace_id=str(deal.workspace_id), user_id=_uid(request), space="comercial")
        return Response(_ser_deal(deal))


class DealWinView(APIView):
    """Marca o negócio como ganho, opcionalmente criando o projeto de entrega."""

    permission_classes = [IsAuthenticated, SpaceAccessPermission]
    required_space = "comercial"

    @extend_schema(request=WinDealSerializer, responses=DealSerializer)
    def post(self, request: Request, deal_id: str) -> Response:
        serializer = WinDealSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        # Fetch deal first to check space access before any side effects
        deal_to_check = GetDeal(DjangoDealRepository(), _workspace_access()).execute(
            deal_id=str(deal_id), actor_id=_uid(request)
        )
        require_space(workspace_id=str(deal_to_check.workspace_id), user_id=_uid(request), space="comercial")
        result = WinDeal(
            DjangoDealRepository(),
            DjangoStageRepository(),
            DjangoCustomerRepository(),
            _workspace_access(),
            DjangoDealHistoryRepository(),
            _project_creator(),
        ).execute(
            deal_id=str(deal_id),
            actor_id=_uid(request),
            create_delivery_project=serializer.validated_data["create_delivery_project"],
        )
        deal = _ser_deal(result.deal)
        deal["created_delivery_project"] = result.created_delivery_project
        deal["delivery_project_key"] = result.delivery_project_key
        warning = ""
        if serializer.validated_data["create_delivery_project"] and not result.created_delivery_project:
            warning = "Este negócio já tinha um projeto de entrega vinculado."
        return Response({"deal": deal, "warning": warning})


class DealLoseView(APIView):
    """Marca o negócio como perdido (motivo obrigatório)."""

    permission_classes = [IsAuthenticated, SpaceAccessPermission]
    required_space = "comercial"

    @extend_schema(request=LoseDealSerializer, responses=DealSerializer)
    def post(self, request: Request, deal_id: str) -> Response:
        serializer = LoseDealSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        # Fetch deal first to check space access
        deal_to_check = GetDeal(DjangoDealRepository(), _workspace_access()).execute(
            deal_id=str(deal_id), actor_id=_uid(request)
        )
        require_space(workspace_id=str(deal_to_check.workspace_id), user_id=_uid(request), space="comercial")
        deal = LoseDeal(
            DjangoDealRepository(),
            DjangoStageRepository(),
            _workspace_access(),
            DjangoDealHistoryRepository(),
        ).execute(
            deal_id=str(deal_id), actor_id=_uid(request), **serializer.validated_data
        )
        return Response({"deal": _ser_deal(deal), "warning": ""})


class DealHistoryView(APIView):
    """Linha do tempo de alterações do negócio."""

    permission_classes = [IsAuthenticated, SpaceAccessPermission]
    required_space = "comercial"

    @extend_schema(responses=DealHistorySerializer(many=True))
    def get(self, request: Request, deal_id: str) -> Response:
        # Fetch deal to check space access
        deal = GetDeal(DjangoDealRepository(), _workspace_access()).execute(
            deal_id=str(deal_id), actor_id=_uid(request)
        )
        require_space(workspace_id=str(deal.workspace_id), user_id=_uid(request), space="comercial")
        entries = ListDealHistory(
            DjangoDealRepository(), _workspace_access(), DjangoDealHistoryRepository()
        ).execute(deal_id=str(deal_id), actor_id=_uid(request))
        return Response([_ser_history(h) for h in entries])


# ── Atividades ───────────────────────────────────────────────────────────────

class DealActivityListCreateView(APIView):
    """Lista e cria atividades de um negócio."""

    permission_classes = [IsAuthenticated, SpaceAccessPermission]
    required_space = "comercial"

    @extend_schema(responses=ActivitySerializer(many=True))
    def get(self, request: Request, deal_id: str) -> Response:
        # Fetch deal to check space access
        deal = GetDeal(DjangoDealRepository(), _workspace_access()).execute(
            deal_id=str(deal_id), actor_id=_uid(request)
        )
        require_space(workspace_id=str(deal.workspace_id), user_id=_uid(request), space="comercial")
        activities = ListActivities(
            DjangoActivityRepository(), DjangoDealRepository(), _workspace_access()
        ).execute(deal_id=str(deal_id), actor_id=_uid(request))
        return Response([_ser_activity(a) for a in activities])

    @extend_schema(request=CreateActivitySerializer, responses=ActivitySerializer)
    def post(self, request: Request, deal_id: str) -> Response:
        serializer = CreateActivitySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        # Fetch deal to check space access before creating activity
        deal = GetDeal(DjangoDealRepository(), _workspace_access()).execute(
            deal_id=str(deal_id), actor_id=_uid(request)
        )
        require_space(workspace_id=str(deal.workspace_id), user_id=_uid(request), space="comercial")
        result = ScheduleActivity(
            DjangoActivityRepository(),
            DjangoDealRepository(),
            _workspace_access(),
            GoogleMeetingScheduler(),
        ).execute(
            deal_id=str(deal_id), actor_id=_uid(request), **serializer.validated_data
        )
        # Degradação sem Google: a atividade existe, o aviso acompanha a resposta
        return Response(
            {"activity": _ser_activity(result.activity), "warning": result.warning},
            status=status.HTTP_201_CREATED,
        )


class WorkspaceActivityListView(APIView):
    """Atividades de todos os negócios do workspace — alimenta a aba Atividades."""

    permission_classes = [IsAuthenticated, SpaceAccessPermission]
    required_space = "comercial"

    @extend_schema(responses=ActivitySerializer(many=True))
    def get(self, request: Request) -> Response:
        workspace_id = _require_workspace(request)
        if not workspace_id:
            return Response(
                {"error": "Informe o parâmetro workspace_id."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        activities = ListWorkspaceActivities(
            DjangoActivityRepository(), _workspace_access()
        ).execute(
            workspace_id=workspace_id,
            actor_id=_uid(request),
            kind=request.query_params.get("kind"),
            assignee_id=request.query_params.get("assignee_id"),
            pending_only=request.query_params.get("pending") == "true",
        )
        return Response([_ser_activity(a) for a in activities])


class DealActivityDetailView(APIView):
    """Atualiza (concluir/reabrir) e remove uma atividade."""

    permission_classes = [IsAuthenticated, SpaceAccessPermission]
    required_space = "comercial"

    @extend_schema(request=UpdateActivitySerializer, responses=ActivitySerializer)
    def patch(self, request: Request, activity_id: str) -> Response:
        serializer = UpdateActivitySerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        activity = UpdateActivity(
            DjangoActivityRepository(), DjangoDealRepository(), _workspace_access()
        ).execute(
            activity_id=str(activity_id),
            actor_id=_uid(request),
            **serializer.validated_data,
        )
        # Check space access via activity's deal
        deal = GetDeal(DjangoDealRepository(), _workspace_access()).execute(
            deal_id=str(activity.deal_id), actor_id=_uid(request)
        )
        require_space(workspace_id=str(deal.workspace_id), user_id=_uid(request), space="comercial")
        return Response(_ser_activity(activity))

    def delete(self, request: Request, activity_id: str) -> Response:
        # Space access check is done in the use case via the deal it accesses
        DeleteActivity(
            DjangoActivityRepository(), DjangoDealRepository(), _workspace_access()
        ).execute(activity_id=str(activity_id), actor_id=_uid(request))
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── Resumo do funil ──────────────────────────────────────────────────────────

class PipelineSummaryView(APIView):
    """Totais por coluna do funil: contagem, soma do valor e soma ponderada."""

    permission_classes = [IsAuthenticated, SpaceAccessPermission]
    required_space = "comercial"

    def get(self, request: Request) -> Response:
        workspace_id = _require_workspace(request)
        if not workspace_id:
            return Response(
                {"error": "Informe o parâmetro workspace_id."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        assert_workspace_member(workspace_id=workspace_id, user_id=_uid(request))
        stages = ListStages(DjangoStageRepository(), _workspace_access()).execute(
            workspace_id=workspace_id, actor_id=_uid(request)
        )
        deals = DjangoDealRepository().list_by_workspace(workspace_id=workspace_id)

        summary = []
        for stage in sorted(stages, key=lambda s: s.order):
            column = [d for d in deals if str(d.stage_id) == str(stage.id)]
            total = sum((d.amount for d in column), Decimal("0"))
            weighted = sum((d.weighted_amount for d in column), Decimal("0"))
            summary.append(
                {
                    "stage_id": str(stage.id),
                    "name": stage.name,
                    "kind": stage.kind.value,
                    "count": len(column),
                    "total_amount": str(total),
                    "weighted_amount": str(weighted),
                }
            )
        return Response(summary)
