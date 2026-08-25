"""Testes da API de alteração de allowed_spaces de membros.

Funções soltas, não classes — segue o padrão do restante da suíte (ver
contexts/sales/tests/test_leads_api.py).
"""
import pytest
from rest_framework.test import APIClient

from contexts.identity.infrastructure.django.models import (
    MembershipModel,
    UserModel,
    WorkspaceModel,
)


@pytest.fixture
def scenario(db):
    owner = UserModel.objects.create_user(
        email="owner@t4e.com", password="x", full_name="Owner", is_active=True
    )
    member = UserModel.objects.create_user(
        email="member@t4e.com", password="x", full_name="Member", is_active=True
    )
    admin = UserModel.objects.create_user(
        email="admin@t4e.com", password="x", full_name="Admin", is_active=True
    )
    ws = WorkspaceModel.objects.create(name="WS", slug="ws-spaces", owner=owner)
    MembershipModel.objects.create(workspace=ws, user=owner, role="owner")
    MembershipModel.objects.create(workspace=ws, user=member, role="member")
    MembershipModel.objects.create(workspace=ws, user=admin, role="admin")

    owner_client = APIClient()
    owner_client.force_authenticate(user=owner)
    member_client = APIClient()
    member_client.force_authenticate(user=member)
    admin_client = APIClient()
    admin_client.force_authenticate(user=admin)

    return {
        "owner": owner,
        "member": member,
        "admin": admin,
        "workspace": ws,
        "owner_client": owner_client,
        "member_client": member_client,
        "admin_client": admin_client,
    }


def test_owner_restringe_membro_via_patch(scenario):
    ws = scenario["workspace"]
    member = scenario["member"]
    resp = scenario["owner_client"].patch(
        f"/api/auth/workspaces/{ws.id}/members/{member.id}/",
        {"allowed_spaces": ["boards"]},
        format="json",
    )
    assert resp.status_code == 200, resp.data
    assert resp.data["allowed_spaces"] == ["boards"]

    membership = MembershipModel.objects.get(workspace=ws, user=member)
    assert membership.allowed_spaces == ["boards"]


def test_members_view_reflete_allowed_spaces(scenario):
    ws = scenario["workspace"]
    member = scenario["member"]
    scenario["owner_client"].patch(
        f"/api/auth/workspaces/{ws.id}/members/{member.id}/",
        {"allowed_spaces": ["boards", "marketing"]},
        format="json",
    )
    resp = scenario["owner_client"].get(f"/api/auth/workspaces/{ws.id}/members/")
    assert resp.status_code == 200
    by_id = {m["user_id"]: m for m in resp.data}
    assert by_id[str(member.id)]["allowed_spaces"] == ["boards", "marketing"]
    # A lista do owner é irrelevante para autorização; novos vínculos começam
    # vazios porque acesso total é definido exclusivamente pelo papel owner.
    assert by_id[str(scenario["owner"].id)]["allowed_spaces"] == []


def test_patch_rejeita_space_desconhecido(scenario):
    ws = scenario["workspace"]
    member = scenario["member"]
    resp = scenario["owner_client"].patch(
        f"/api/auth/workspaces/{ws.id}/members/{member.id}/",
        {"allowed_spaces": ["boards", "invalido"]},
        format="json",
    )
    assert resp.status_code == 400


def test_patch_sem_role_e_sem_allowed_spaces_e_rejeitado(scenario):
    ws = scenario["workspace"]
    member = scenario["member"]
    resp = scenario["owner_client"].patch(
        f"/api/auth/workspaces/{ws.id}/members/{member.id}/",
        {},
        format="json",
    )
    assert resp.status_code == 400


def test_membro_nao_admin_nao_pode_alterar_spaces_de_outro(scenario):
    ws = scenario["workspace"]
    owner = scenario["owner"]
    resp = scenario["member_client"].patch(
        f"/api/auth/workspaces/{ws.id}/members/{owner.id}/",
        {"allowed_spaces": ["boards"]},
        format="json",
    )
    assert resp.status_code == 403


def test_admin_nao_pode_alterar_spaces(scenario):
    ws = scenario["workspace"]
    member = scenario["member"]
    resp = scenario["admin_client"].patch(
        f"/api/auth/workspaces/{ws.id}/members/{member.id}/",
        {"allowed_spaces": ["boards"]},
        format="json",
    )
    assert resp.status_code == 403


def test_patch_pode_alterar_role_e_spaces_juntos(scenario):
    ws = scenario["workspace"]
    member = scenario["member"]
    resp = scenario["owner_client"].patch(
        f"/api/auth/workspaces/{ws.id}/members/{member.id}/",
        {"role": "admin", "allowed_spaces": ["comercial"]},
        format="json",
    )
    assert resp.status_code == 200, resp.data
    assert resp.data["role"] == "admin"
    assert resp.data["allowed_spaces"] == ["comercial"]

    membership = MembershipModel.objects.get(workspace=ws, user=member)
    assert membership.role == "admin"
    assert membership.allowed_spaces == ["comercial"]


def test_null_explicito_e_rejeitado(scenario):
    ws = scenario["workspace"]
    member = scenario["member"]
    scenario["owner_client"].patch(
        f"/api/auth/workspaces/{ws.id}/members/{member.id}/",
        {"allowed_spaces": ["boards"]},
        format="json",
    )
    resp = scenario["owner_client"].patch(
        f"/api/auth/workspaces/{ws.id}/members/{member.id}/",
        {"allowed_spaces": None},
        format="json",
    )
    assert resp.status_code == 400, resp.data
