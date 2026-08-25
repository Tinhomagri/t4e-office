"""Views finas de metas comerciais (Metas & Forecast)."""
from decimal import Decimal

from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from contexts.sales.application.use_cases.manage_goals import (
    CreateGoal,
    DeleteGoal,
    GetGoal,
    ListGoals,
    UpdateGoal,
)
from contexts.sales.infrastructure.django.models import DealModel
from contexts.sales.infrastructure.django.repositories_impl import (
    DjangoGoalRepository,
    DjangoWorkspaceAccess,
)
from contexts.sales.interface.api.goal_serializers import (
    CreateGoalSerializer,
    UpdateGoalSerializer,
)
from contexts.sales.interface.api.permissions import assert_workspace_member
from contexts.sales.interface.api.views import _require_workspace, _uid
from shared.interface.permissions import SpaceAccessPermission


def _uid_or_actor(request: Request) -> str:
    return _uid(request)


def _ser_goal(g) -> dict:
    return {
        "id": str(g.id),
        "workspace_id": str(g.workspace_id),
        "period": g.period,
        "target_amount": str(g.target_amount),
        "currency": g.currency,
        "owner_id": g.owner_id,
    }


class GoalListCreateView(APIView):
    """Lista e cria metas comerciais dentro de um workspace."""

    permission_classes = [IsAuthenticated, SpaceAccessPermission]
    required_space = "comercial"

    @extend_schema(responses=None)
    def get(self, request: Request) -> Response:
        workspace_id = _require_workspace(request)
        if not workspace_id:
            return Response(
                {"error": "Informe o parâmetro workspace_id."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        goals = ListGoals(DjangoGoalRepository(), DjangoWorkspaceAccess()).execute(
            workspace_id=workspace_id,
            actor_id=_uid_or_actor(request),
            period=request.query_params.get("period") or None,
            owner_id=request.query_params.get("owner_id") or None,
        )
        return Response([_ser_goal(g) for g in goals])

    @extend_schema(request=CreateGoalSerializer, responses=None)
    def post(self, request: Request) -> Response:
        serializer = CreateGoalSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        workspace_id = data.pop("workspace_id")
        goal = CreateGoal(DjangoGoalRepository(), DjangoWorkspaceAccess()).execute(
            workspace_id=workspace_id, actor_id=_uid_or_actor(request), **data
        )
        return Response(_ser_goal(goal), status=status.HTTP_201_CREATED)


class GoalDetailView(APIView):
    """Detalha, atualiza e remove uma meta."""

    permission_classes = [IsAuthenticated, SpaceAccessPermission]
    required_space = "comercial"

    @extend_schema(responses=None)
    def get(self, request: Request, goal_id: str) -> Response:
        goal = GetGoal(DjangoGoalRepository(), DjangoWorkspaceAccess()).execute(
            goal_id=goal_id, actor_id=_uid_or_actor(request)
        )
        return Response(_ser_goal(goal))

    @extend_schema(request=UpdateGoalSerializer, responses=None)
    def patch(self, request: Request, goal_id: str) -> Response:
        serializer = UpdateGoalSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        goal = UpdateGoal(DjangoGoalRepository(), DjangoWorkspaceAccess()).execute(
            goal_id=goal_id, actor_id=_uid_or_actor(request), **serializer.validated_data
        )
        return Response(_ser_goal(goal))

    def delete(self, request: Request, goal_id: str) -> Response:
        DeleteGoal(DjangoGoalRepository(), DjangoWorkspaceAccess()).execute(
            goal_id=goal_id, actor_id=_uid_or_actor(request)
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class GoalForecastView(APIView):
    """GET progresso das metas: alvo x realizado (ganho) x forecast (aberto ponderado).

    Query: workspace_id (obrigatório), period (AAAA-MM, default mês atual).
    Cada meta cadastrada no período é enriquecida com o realizado e o forecast
    do mesmo escopo (workspace inteiro quando `owner_id` da meta é nulo, ou
    apenas os negócios daquele vendedor).
    """

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

        period = request.query_params.get("period") or timezone.localdate().strftime("%Y-%m")

        goals = ListGoals(DjangoGoalRepository(), DjangoWorkspaceAccess()).execute(
            workspace_id=workspace_id, actor_id=_uid(request), period=period
        )

        deals = DealModel.objects.filter(workspace_id=workspace_id).select_related("stage")

        result = []
        for goal in goals:
            scoped = deals if goal.owner_id is None else deals.filter(owner_id=goal.owner_id)

            achieved = Decimal("0")
            forecast_weighted = Decimal("0")
            for deal in scoped:
                kind = deal.stage.kind
                if kind == "won" and deal.won_at and deal.won_at.strftime("%Y-%m") == period:
                    achieved += deal.amount
                elif (
                    kind == "open"
                    and deal.expected_close_date
                    and deal.expected_close_date.strftime("%Y-%m") == period
                ):
                    forecast_weighted += deal.amount * Decimal(deal.probability) / Decimal(100)

            attainment_pct = (
                round(achieved / goal.target_amount * 100, 1)
                if goal.target_amount
                else 0.0
            )

            result.append(
                {
                    **_ser_goal(goal),
                    "achieved_amount": str(achieved),
                    "forecast_weighted_amount": str(forecast_weighted),
                    "gap_amount": str(max(goal.target_amount - achieved, Decimal("0"))),
                    "attainment_pct": attainment_pct,
                }
            )

        return Response({"period": period, "goals": result})
