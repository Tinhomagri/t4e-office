"""Testes da API de metas comerciais (Metas & Forecast)."""
from datetime import date
from decimal import Decimal

from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from contexts.identity.infrastructure.django.models import (
    MembershipModel,
    UserModel,
    WorkspaceModel,
)
from contexts.sales.infrastructure.django.models import (
    CustomerModel,
    DealModel,
    PipelineStageModel,
    SalesGoalModel,
)


class GoalsApiTests(TestCase):
    """Cobre criação, listagem e forecast de metas."""

    def setUp(self):
        self.user = UserModel.objects.create_user(
            email="vendedor@t4e.com", password="senha123", full_name="Vendedor"
        )
        self.workspace = WorkspaceModel.objects.create(name="Workspace Teste", owner=self.user)
        MembershipModel.objects.create(workspace=self.workspace, user=self.user, role="owner")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

        self.customer = CustomerModel.objects.create(
            workspace=self.workspace, name="Cliente X"
        )
        self.won_stage = PipelineStageModel.objects.create(
            workspace=self.workspace, name="Ganho", slug="won", order=2, kind="won"
        )
        self.open_stage = PipelineStageModel.objects.create(
            workspace=self.workspace, name="Aberto", slug="open", order=1, kind="open"
        )

    def test_creates_and_lists_goal(self):
        url = reverse("sales-goal-list")
        payload = {
            "workspace_id": str(self.workspace.id),
            "period": "2026-07",
            "target_amount": "10000.00",
        }
        response = self.client.post(url, payload, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["period"], "2026-07")

        list_response = self.client.get(url, {"workspace_id": str(self.workspace.id)})
        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(len(list_response.data), 1)

    def test_rejects_invalid_period(self):
        url = reverse("sales-goal-list")
        payload = {
            "workspace_id": str(self.workspace.id),
            "period": "2026-13",
            "target_amount": "10000.00",
        }
        response = self.client.post(url, payload, format="json")
        self.assertEqual(response.status_code, 400)

    def test_forecast_combines_target_achieved_and_open_weighted(self):
        SalesGoalModel.objects.create(
            workspace=self.workspace, period="2026-07", target_amount=Decimal("10000.00")
        )
        DealModel.objects.create(
            workspace=self.workspace,
            title="Negócio ganho",
            customer=self.customer,
            stage=self.won_stage,
            amount=Decimal("4000.00"),
            probability=100,
            won_at="2026-07-10T12:00:00Z",
        )
        DealModel.objects.create(
            workspace=self.workspace,
            title="Negócio aberto",
            customer=self.customer,
            stage=self.open_stage,
            amount=Decimal("2000.00"),
            probability=50,
            expected_close_date=date(2026, 7, 25),
        )

        url = reverse("sales-goal-forecast")
        response = self.client.get(
            url, {"workspace_id": str(self.workspace.id), "period": "2026-07"}
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["period"], "2026-07")
        goal = response.data["goals"][0]
        self.assertEqual(goal["achieved_amount"], "4000.00")
        self.assertEqual(goal["forecast_weighted_amount"], "1000.00")
        self.assertEqual(goal["attainment_pct"], 40.0)

    def test_deletes_goal(self):
        goal = SalesGoalModel.objects.create(
            workspace=self.workspace, period="2026-07", target_amount=Decimal("5000.00")
        )
        url = reverse("sales-goal-detail", kwargs={"goal_id": goal.id})
        response = self.client.delete(url)
        self.assertEqual(response.status_code, 204)
        self.assertFalse(SalesGoalModel.objects.filter(id=goal.id).exists())
