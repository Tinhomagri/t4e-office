"""Views das propostas comerciais."""
from django.http import HttpResponse
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from contexts.sales.application.use_cases.manage_proposals import (
    AcceptProposal,
    CreateProposal,
    DeleteProposal,
    GetProposal,
    ListProposals,
    RejectProposal,
    RenderProposalPdf,
    SendProposal,
    UpdateProposal,
)
from contexts.sales.infrastructure.adapters.proposal_mailer import DjangoProposalMailer
from contexts.sales.infrastructure.adapters.proposal_pdf import ReportLabProposalRenderer
from contexts.sales.infrastructure.django.models import DealModel, ProposalModel
from contexts.sales.infrastructure.django.proposal_repository_impl import (
    DjangoProposalRepository,
)
from contexts.sales.interface.api.permissions import assert_workspace_member
from contexts.sales.interface.api.proposal_serializers import (
    CreateProposalSerializer,
    ProposalSerializer,
    RejectProposalSerializer,
    SendProposalSerializer,
    UpdateProposalSerializer,
)
from shared.domain.errors import NotFoundError, ValidationError


def _repo() -> DjangoProposalRepository:
    return DjangoProposalRepository()


def _assert_proposal_access(proposal_id: str, user_id: str) -> ProposalModel:
    """Multi-tenancy: a proposta precisa ser de um workspace do usuário."""
    row = ProposalModel.objects.select_related("workspace").filter(id=proposal_id).first()
    if row is None:
        raise NotFoundError("Proposta não encontrada.")
    assert_workspace_member(workspace_id=str(row.workspace_id), user_id=user_id)
    return row


def _workspace_name(row: ProposalModel) -> str:
    return row.workspace.name if row.workspace_id else ""


class ProposalListCreateView(APIView):
    """Lista as propostas do workspace e cria nova a partir de um negócio."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses=ProposalSerializer(many=True))
    def get(self, request: Request) -> Response:
        workspace_id = request.query_params.get("workspace_id")
        if not workspace_id:
            raise ValidationError("Informe o workspace_id.")
        assert_workspace_member(workspace_id=workspace_id, user_id=str(request.user.id))
        proposals = ListProposals(proposals=_repo()).execute(
            workspace_id=workspace_id,
            deal_id=request.query_params.get("deal_id") or None,
        )
        return Response(ProposalSerializer(proposals, many=True).data)

    @extend_schema(request=CreateProposalSerializer, responses=ProposalSerializer)
    def post(self, request: Request) -> Response:
        payload = CreateProposalSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data
        workspace_id = str(data["workspace_id"])
        assert_workspace_member(workspace_id=workspace_id, user_id=str(request.user.id))

        proposal = CreateProposal(proposals=_repo(), deals=DealModel.objects).execute(
            workspace_id=workspace_id,
            deal_id=str(data["deal_id"]),
            title=data.get("title", ""),
            currency=data.get("currency", ""),
            intro=data.get("intro", ""),
            terms=data.get("terms", ""),
            valid_until=data.get("valid_until"),
            discount=data.get("discount", 0),
            items=data.get("items", []),
            user_id=str(request.user.id),
        )
        return Response(ProposalSerializer(proposal).data, status=status.HTTP_201_CREATED)


class ProposalDetailView(APIView):
    """Detalhe, edição e exclusão de uma proposta."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses=ProposalSerializer)
    def get(self, request: Request, proposal_id: str) -> Response:
        _assert_proposal_access(str(proposal_id), str(request.user.id))
        proposal = GetProposal(proposals=_repo()).execute(proposal_id=str(proposal_id))
        return Response(ProposalSerializer(proposal).data)

    @extend_schema(request=UpdateProposalSerializer, responses=ProposalSerializer)
    def patch(self, request: Request, proposal_id: str) -> Response:
        _assert_proposal_access(str(proposal_id), str(request.user.id))
        payload = UpdateProposalSerializer(data=request.data, partial=True)
        payload.is_valid(raise_exception=True)
        proposal = UpdateProposal(proposals=_repo()).execute(
            proposal_id=str(proposal_id), changes=payload.validated_data
        )
        return Response(ProposalSerializer(proposal).data)

    def delete(self, request: Request, proposal_id: str) -> Response:
        _assert_proposal_access(str(proposal_id), str(request.user.id))
        DeleteProposal(proposals=_repo()).execute(proposal_id=str(proposal_id))
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProposalPdfView(APIView):
    """Baixa o PDF da proposta."""

    permission_classes = [IsAuthenticated]

    def get(self, request: Request, proposal_id: str) -> HttpResponse:
        row = _assert_proposal_access(str(proposal_id), str(request.user.id))
        pdf, filename = RenderProposalPdf(
            proposals=_repo(), renderer=ReportLabProposalRenderer()
        ).execute(proposal_id=str(proposal_id), workspace_name=_workspace_name(row))

        response = HttpResponse(pdf, content_type="application/pdf")
        response["Content-Disposition"] = f'inline; filename="{filename}"'
        return response


class ProposalSendView(APIView):
    """Envia a proposta ao cliente com o PDF anexo."""

    permission_classes = [IsAuthenticated]

    @extend_schema(request=SendProposalSerializer, responses=ProposalSerializer)
    def post(self, request: Request, proposal_id: str) -> Response:
        row = _assert_proposal_access(str(proposal_id), str(request.user.id))
        payload = SendProposalSerializer(data=request.data)
        payload.is_valid(raise_exception=True)

        proposal = SendProposal(
            proposals=_repo(),
            renderer=ReportLabProposalRenderer(),
            mailer=DjangoProposalMailer(),
        ).execute(
            proposal_id=str(proposal_id),
            to_email=payload.validated_data["to_email"],
            message=payload.validated_data.get("message", ""),
            workspace_name=_workspace_name(row),
        )
        return Response(ProposalSerializer(proposal).data)


class ProposalAcceptView(APIView):
    """Registra o aceite e devolve a sugestão de ganhar o negócio."""

    permission_classes = [IsAuthenticated]

    def post(self, request: Request, proposal_id: str) -> Response:
        _assert_proposal_access(str(proposal_id), str(request.user.id))
        result = AcceptProposal(proposals=_repo(), deals=DealModel.objects).execute(
            proposal_id=str(proposal_id)
        )
        return Response(
            {
                "proposal": ProposalSerializer(result["proposal"]).data,
                # `null` quando o negócio já está ganho — a tela não sugere nada.
                "suggestion": result["suggestion"],
            }
        )


class ProposalRejectView(APIView):
    """Registra a recusa do cliente."""

    permission_classes = [IsAuthenticated]

    @extend_schema(request=RejectProposalSerializer, responses=ProposalSerializer)
    def post(self, request: Request, proposal_id: str) -> Response:
        _assert_proposal_access(str(proposal_id), str(request.user.id))
        payload = RejectProposalSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        proposal = RejectProposal(proposals=_repo()).execute(
            proposal_id=str(proposal_id),
            reason=payload.validated_data.get("reason", ""),
        )
        return Response(ProposalSerializer(proposal).data)
