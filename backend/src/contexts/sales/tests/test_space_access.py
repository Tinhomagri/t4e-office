"""Testes da SpaceAccessPermission: gating de views do CRM ao space comercial.

Verifica que membros sem acesso ao space "comercial" recebem 403,
e membros com acesso (ou sem restrição) conseguem acessar.
"""
import pytest
from rest_framework.test import APIClient

from contexts.identity.infrastructure.django.models import (
    MembershipModel,
    UserModel,
    WorkspaceModel,
)
from contexts.sales.infrastructure.django.models import CustomerModel, LeadModel
from contexts.sales.application.use_cases.seed_default_stages import SeedDefaultStages
from contexts.sales.infrastructure.django.repositories_impl import DjangoStageRepository


@pytest.fixture
def scenario(db):
    """Workspace com membros com e sem acesso ao space comercial."""
    owner = UserModel.objects.create_user(
        email="owner@t4e.com", password="x", full_name="Owner", is_active=True
    )
    comercial_member = UserModel.objects.create_user(
        email="comercial@t4e.com", password="x", full_name="Comercial", is_active=True
    )
    restricted_member = UserModel.objects.create_user(
        email="boards@t4e.com", password="x", full_name="Boards Only", is_active=True
    )

    ws = WorkspaceModel.objects.create(name="WS", slug="ws-space-test", owner=owner)

    # Owner: unrestricted (allowed_spaces=None means all spaces)
    MembershipModel.objects.create(workspace=ws, user=owner, role="owner", allowed_spaces=None)

    # Comercial member: has "comercial" space
    MembershipModel.objects.create(
        workspace=ws, user=comercial_member, role="member", allowed_spaces=["comercial"]
    )

    # Restricted member: only has "boards" space, no "comercial"
    MembershipModel.objects.create(
        workspace=ws, user=restricted_member, role="member", allowed_spaces=["boards"]
    )

    # Seed default stages for CRM operations
    SeedDefaultStages(DjangoStageRepository()).execute(workspace_id=str(ws.id))

    owner_client = APIClient()
    owner_client.force_authenticate(user=owner)

    comercial_client = APIClient()
    comercial_client.force_authenticate(user=comercial_member)

    restricted_client = APIClient()
    restricted_client.force_authenticate(user=restricted_member)

    return {
        "workspace": ws,
        "owner": owner,
        "comercial_member": comercial_member,
        "restricted_member": restricted_member,
        "owner_client": owner_client,
        "comercial_client": comercial_client,
        "restricted_client": restricted_client,
    }


def test_lead_list_unrestricted_member_can_access(scenario):
    """Owner (unrestricted) pode acessar lead list."""
    resp = scenario["owner_client"].get(
        "/api/sales/leads/", {"workspace_id": str(scenario["workspace"].id)}
    )
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.data}"


def test_lead_list_comercial_member_can_access(scenario):
    """Member com "comercial" space pode acessar lead list."""
    resp = scenario["comercial_client"].get(
        "/api/sales/leads/", {"workspace_id": str(scenario["workspace"].id)}
    )
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.data}"


def test_lead_list_restricted_member_denied(scenario):
    """Member sem "comercial" space recebe 403 ao tentar lead list."""
    resp = scenario["restricted_client"].get(
        "/api/sales/leads/", {"workspace_id": str(scenario["workspace"].id)}
    )
    assert resp.status_code == 403, f"Expected 403, got {resp.status_code}: {resp.data}"


def test_lead_create_comercial_member_can_create(scenario):
    """Member com "comercial" space pode criar lead."""
    payload = {
        "workspace_id": str(scenario["workspace"].id),
        "name": "Test Lead",
        "company": "Test Co",
    }
    resp = scenario["comercial_client"].post("/api/sales/leads/", payload, format="json")
    assert resp.status_code == 201, f"Expected 201, got {resp.status_code}: {resp.data}"


def test_lead_create_restricted_member_denied(scenario):
    """Member sem "comercial" space recebe 403 ao criar lead."""
    payload = {
        "workspace_id": str(scenario["workspace"].id),
        "name": "Test Lead",
        "company": "Test Co",
    }
    resp = scenario["restricted_client"].post("/api/sales/leads/", payload, format="json")
    assert resp.status_code == 403, f"Expected 403, got {resp.status_code}: {resp.data}"


def test_customer_list_comercial_member_can_access(scenario):
    """Member com "comercial" space pode acessar customer list."""
    resp = scenario["comercial_client"].get(
        "/api/sales/customers/", {"workspace_id": str(scenario["workspace"].id)}
    )
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.data}"


def test_customer_list_restricted_member_denied(scenario):
    """Member sem "comercial" space recebe 403 ao tentar customer list."""
    resp = scenario["restricted_client"].get(
        "/api/sales/customers/", {"workspace_id": str(scenario["workspace"].id)}
    )
    assert resp.status_code == 403, f"Expected 403, got {resp.status_code}: {resp.data}"


def test_pipeline_metrics_comercial_member_can_access(scenario):
    """Member com "comercial" space pode acessar pipeline metrics."""
    resp = scenario["comercial_client"].get(
        "/api/sales/pipeline/metrics/", {"workspace_id": str(scenario["workspace"].id)}
    )
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.data}"


def test_pipeline_metrics_restricted_member_denied(scenario):
    """Member sem "comercial" space recebe 403 ao tentar pipeline metrics."""
    resp = scenario["restricted_client"].get(
        "/api/sales/pipeline/metrics/", {"workspace_id": str(scenario["workspace"].id)}
    )
    assert resp.status_code == 403, f"Expected 403, got {resp.status_code}: {resp.data}"
