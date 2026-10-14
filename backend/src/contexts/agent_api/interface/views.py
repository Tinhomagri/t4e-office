"""Rotas de leitura da API de agentes."""
from django.http import JsonResponse
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.request import Request

from contexts.agent_api.infrastructure.models import AgentAuditLogModel
from contexts.agent_api.interface.base import AgentAPIView
from contexts.agent_api.interface.formatting import dt
from contexts.agent_api.interface.pagination import paginate, parse_datetime_param


def health(request):
    return JsonResponse({"status": "ok"})


class AuditoriaView(AgentAPIView):
    """GET /auditoria?agente=&desde= — requisições de agentes que compartilham
    workspace com o token (inclusive as barradas)."""

    @extend_schema(
        parameters=[
            OpenApiParameter("agente", str),
            OpenApiParameter("desde", str, description="ISO 8601"),
        ]
    )
    def get(self, request: Request):
        qs = AgentAuditLogModel.objects.filter(
            agente__workspaces__in=self.workspace_ids()
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
