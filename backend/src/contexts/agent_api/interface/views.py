"""Rotas de leitura da API de agentes."""
import uuid

from django.db.models import Min, Q
from django.http import JsonResponse
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.request import Request

from contexts.agent_api.infrastructure.models import AgentAuditLogModel
from contexts.agent_api.interface.base import AgentAPIView
from contexts.agent_api.interface.formatting import (
    PROJECT_STATUS,
    PROJECT_STATUS_IN,
    day,
    dt,
)
from contexts.agent_api.interface.pagination import paginate, parse_datetime_param
from contexts.projects.infrastructure.django.models import ProjectModel
from shared.domain.errors import ValidationError


def health(request):
    return JsonResponse({"status": "ok"})


class AuditoriaView(AgentAPIView):
    """GET /auditoria?agente=&desde= — requisições de agentes que compartilham
    workspace com o token (inclusive as barradas) e as tentativas com token
    inválido (`agente: null`), que não pertencem a workspace nenhum."""

    @extend_schema(
        parameters=[
            OpenApiParameter("agente", str),
            OpenApiParameter("desde", str, description="ISO 8601"),
        ]
    )
    def get(self, request: Request):
        qs = AgentAuditLogModel.objects.filter(
            Q(agente__workspaces__in=self.workspace_ids()) | Q(agente__isnull=True)
        ).distinct()
        if agente := request.query_params.get("agente"):
            qs = qs.filter(agente_id=agente)
        if desde := parse_datetime_param(request, "desde"):
            qs = qs.filter(criado_em__gte=desde)

        def serialize(rows):
            return [
                {
                    "id": r.id,
                    "agente": r.agente_id,
                    "metodo": r.metodo,
                    "rota": r.rota,
                    "status": r.status,
                    "correlation_id": r.correlation_id,
                    "quando": dt(r.criado_em),
                }
                for r in rows
            ]

        return paginate(request, qs, serialize, order_field="criado_em")


class ProjetosView(AgentAPIView):
    """GET /projetos?status=&squad=&updated_since= — `contrato_id` liga o
    trabalho do time ao que foi contratado no Manager."""

    @extend_schema(
        parameters=[
            OpenApiParameter("status", str, enum=list(PROJECT_STATUS_IN)),
            OpenApiParameter("squad", str, description="nome ou id da squad"),
            OpenApiParameter("updated_since", str, description="ISO 8601"),
            OpenApiParameter("limit", int),
            OpenApiParameter("cursor", str),
        ]
    )
    def get(self, request: Request):
        qs = ProjectModel.objects.filter(workspace_id__in=self.workspace_ids()).select_related(
            "squad"
        ).annotate(first_sprint=Min("sprints__start_date"))
        if status := request.query_params.get("status"):
            if status not in PROJECT_STATUS_IN:
                raise ValidationError("`status` deve ser ativo, pausado ou encerrado.")
            if status == "encerrado":
                qs = qs.filter(Q(status="closed") | Q(archived_at__isnull=False))
            else:
                qs = qs.filter(status=PROJECT_STATUS_IN[status], archived_at__isnull=True)
        if squad := request.query_params.get("squad"):
            cond = Q(squad__name=squad)
            if _is_uuid(squad):
                cond |= Q(squad_id=squad)
            qs = qs.filter(cond)

        def serialize(rows):
            return [
                {
                    "id": str(p.id),
                    "nome": p.name,
                    "squad": p.squad.name if p.squad else None,
                    "status": "encerrado" if p.archived_at else PROJECT_STATUS[p.status],
                    "cliente_id": p.manager_client_id or None,
                    "contrato_id": p.manager_contract_id or None,
                    "inicio": day(p.first_sprint or p.created_at),
                    "fim_previsto": day(p.deadline),
                    "atualizado_em": dt(p.updated_at),
                }
                for p in rows
            ]

        return paginate(request, qs, serialize)


def _is_uuid(value: str) -> bool:
    try:
        uuid.UUID(value)
    except ValueError:
        return False
    return True
