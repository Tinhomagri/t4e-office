"""Views de leads: captação, fila de qualificação e conversão em negócio."""
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from contexts.sales.application.use_cases.manage_leads import (
    ConvertLead,
    CreateLead,
    DeleteLead,
    DisqualifyLead,
    GetLead,
    ImportLeadsCsv,
    ListLeads,
    MarkLeadContacted,
    QualifyLead,
    UpdateLead,
)
from contexts.sales.infrastructure.django.lead_repository_impl import (
    DjangoLeadRepository,
)
from contexts.sales.infrastructure.django.repositories_impl import (
    DjangoCustomerRepository,
    DjangoDealRepository,
    DjangoStageRepository,
    DjangoWorkspaceAccess,
)
from contexts.sales.interface.api.lead_serializers import (
    ConvertLeadSerializer,
    CreateLeadSerializer,
    DisqualifyLeadSerializer,
    ImportLeadsResultSerializer,
    ImportLeadsSerializer,
    LeadSerializer,
    QualifyLeadSerializer,
    UpdateLeadSerializer,
)
from shared.domain.errors import ValidationError


def _repo() -> DjangoLeadRepository:
    return DjangoLeadRepository()


def _access() -> DjangoWorkspaceAccess:
    return DjangoWorkspaceAccess()


def _uid(request: Request) -> str:
    return str(request.user.id)


class LeadListCreateView(APIView):
    """Lista a fila de leads do workspace e capta um lead manualmente."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses=LeadSerializer(many=True))
    def get(self, request: Request) -> Response:
        workspace_id = request.query_params.get("workspace_id")
        if not workspace_id:
            raise ValidationError("Informe o workspace_id.")
        leads = ListLeads(_repo(), _access()).execute(
            workspace_id=workspace_id,
            actor_id=_uid(request),
            status=request.query_params.get("status") or None,
            owner_id=request.query_params.get("owner_id") or None,
            search=request.query_params.get("search", ""),
            overdue_only=request.query_params.get("overdue") == "true",
        )
        return Response(LeadSerializer(leads, many=True).data)

    @extend_schema(request=CreateLeadSerializer, responses=LeadSerializer)
    def post(self, request: Request) -> Response:
        payload = CreateLeadSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = dict(payload.validated_data)
        workspace_id = data.pop("workspace_id")
        lead = CreateLead(_repo(), _access()).execute(
            workspace_id=workspace_id, actor_id=_uid(request), **data
        )
        return Response(LeadSerializer(lead).data, status=status.HTTP_201_CREATED)


class LeadImportView(APIView):
    """Importa leads em lote a partir de um CSV colado (name,company,email,phone,source)."""

    permission_classes = [IsAuthenticated]

    @extend_schema(request=ImportLeadsSerializer, responses=ImportLeadsResultSerializer)
    def post(self, request: Request) -> Response:
        payload = ImportLeadsSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        result = ImportLeadsCsv(_repo(), _access()).execute(
            workspace_id=str(payload.validated_data["workspace_id"]),
            actor_id=_uid(request),
            csv_text=payload.validated_data["csv_text"],
        )
        return Response(
            {
                "imported": LeadSerializer(result.imported, many=True).data,
                "errors": result.errors,
            },
            status=status.HTTP_201_CREATED,
        )


class LeadDetailView(APIView):
    """Detalha, edita e remove um lead."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses=LeadSerializer)
    def get(self, request: Request, lead_id: str) -> Response:
        lead = GetLead(_repo(), _access()).execute(lead_id=str(lead_id), actor_id=_uid(request))
        return Response(LeadSerializer(lead).data)

    @extend_schema(request=UpdateLeadSerializer, responses=LeadSerializer)
    def patch(self, request: Request, lead_id: str) -> Response:
        payload = UpdateLeadSerializer(data=request.data, partial=True)
        payload.is_valid(raise_exception=True)
        lead = UpdateLead(_repo(), _access()).execute(
            lead_id=str(lead_id), actor_id=_uid(request), **payload.validated_data
        )
        return Response(LeadSerializer(lead).data)

    def delete(self, request: Request, lead_id: str) -> Response:
        DeleteLead(_repo(), _access()).execute(lead_id=str(lead_id), actor_id=_uid(request))
        return Response(status=status.HTTP_204_NO_CONTENT)


class LeadContactedView(APIView):
    """Marca o primeiro contato — encerra o relógio do SLA."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses=LeadSerializer)
    def post(self, request: Request, lead_id: str) -> Response:
        lead = MarkLeadContacted(_repo(), _access()).execute(
            lead_id=str(lead_id), actor_id=_uid(request)
        )
        return Response(LeadSerializer(lead).data)


class LeadQualifyView(APIView):
    """Atribui score e move o lead para qualificado."""

    permission_classes = [IsAuthenticated]

    @extend_schema(request=QualifyLeadSerializer, responses=LeadSerializer)
    def post(self, request: Request, lead_id: str) -> Response:
        payload = QualifyLeadSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        lead = QualifyLead(_repo(), _access()).execute(
            lead_id=str(lead_id), actor_id=_uid(request), score=payload.validated_data["score"]
        )
        return Response(LeadSerializer(lead).data)


class LeadDisqualifyView(APIView):
    """Descarta o lead com motivo — sai da esteira sem virar negócio."""

    permission_classes = [IsAuthenticated]

    @extend_schema(request=DisqualifyLeadSerializer, responses=LeadSerializer)
    def post(self, request: Request, lead_id: str) -> Response:
        payload = DisqualifyLeadSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        lead = DisqualifyLead(_repo(), _access()).execute(
            lead_id=str(lead_id), actor_id=_uid(request), reason=payload.validated_data["reason"]
        )
        return Response(LeadSerializer(lead).data)


class LeadConvertView(APIView):
    """Converte o lead em cliente + negócio, sem redigitar dado nenhum."""

    permission_classes = [IsAuthenticated]

    @extend_schema(request=ConvertLeadSerializer, responses=LeadSerializer)
    def post(self, request: Request, lead_id: str) -> Response:
        payload = ConvertLeadSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        result = ConvertLead(
            _repo(), DjangoCustomerRepository(), DjangoDealRepository(),
            DjangoStageRepository(), _access(),
        ).execute(
            lead_id=str(lead_id),
            actor_id=_uid(request),
            deal_title=payload.validated_data.get("deal_title", ""),
            amount=payload.validated_data.get("amount") or "0",
        )
        return Response(
            {
                "lead": LeadSerializer(result.lead).data,
                "customer_id": result.customer_id,
                "deal_id": result.deal_id,
            }
        )
