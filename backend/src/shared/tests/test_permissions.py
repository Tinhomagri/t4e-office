"""Testes de SpaceAccessPermission.

Usa objetos simples (duck typing) no lugar de um request DRF real: a
permission só olha `request.query_params`, `request.data` e `request.user`,
então um stub minimalista deixa o teste focado na regra em si, sem a
maquinaria de autenticação do DRF.
"""
import pytest

from contexts.identity.infrastructure.django.models import (
    MembershipModel,
    UserModel,
    WorkspaceModel,
)
from shared.interface.permissions import SpaceAccessPermission


class _FakeRequest:
    def __init__(self, *, user, query_params=None, data=None):
        self.user = user
        self.query_params = query_params or {}
        self.data = data or {}


class _ViewWithoutSpace:
    pass


class _ViewWithSpace:
    def __init__(self, space):
        self.required_space = space


@pytest.fixture
def scenario(db):
    owner = UserModel.objects.create_user(
        email="owner@t4e.com", password="x", full_name="Owner", is_active=True
    )
    member = UserModel.objects.create_user(
        email="member@t4e.com", password="x", full_name="Member", is_active=True
    )
    ws = WorkspaceModel.objects.create(name="WS", slug="ws-perm", owner=owner)
    MembershipModel.objects.create(workspace=ws, user=owner, role="owner")
    MembershipModel.objects.create(
        workspace=ws, user=member, role="member", allowed_spaces=["boards"]
    )
    return {"ws": ws, "owner": owner, "member": member}


def test_view_sem_required_space_sempre_passa(scenario):
    request = _FakeRequest(
        user=scenario["member"], query_params={"workspace_id": str(scenario["ws"].id)}
    )
    permission = SpaceAccessPermission()
    assert permission.has_permission(request, _ViewWithoutSpace()) is True


def test_view_com_required_space_libera_membro_permitido(scenario):
    request = _FakeRequest(
        user=scenario["member"], query_params={"workspace_id": str(scenario["ws"].id)}
    )
    permission = SpaceAccessPermission()
    assert permission.has_permission(request, _ViewWithSpace("boards")) is True


def test_view_com_required_space_bloqueia_membro_sem_acesso(scenario):
    request = _FakeRequest(
        user=scenario["member"], query_params={"workspace_id": str(scenario["ws"].id)}
    )
    permission = SpaceAccessPermission()
    assert permission.has_permission(request, _ViewWithSpace("marketing")) is False


def test_owner_sempre_passa_mesmo_com_required_space(scenario):
    request = _FakeRequest(
        user=scenario["owner"], query_params={"workspace_id": str(scenario["ws"].id)}
    )
    permission = SpaceAccessPermission()
    assert permission.has_permission(request, _ViewWithSpace("marketing")) is True


def test_workspace_id_pode_vir_do_body(scenario):
    request = _FakeRequest(
        user=scenario["member"], data={"workspace_id": str(scenario["ws"].id)}
    )
    permission = SpaceAccessPermission()
    assert permission.has_permission(request, _ViewWithSpace("boards")) is True


def test_sem_workspace_id_libera_para_downstream_decidir(scenario):
    request = _FakeRequest(user=scenario["member"])
    permission = SpaceAccessPermission()
    assert permission.has_permission(request, _ViewWithSpace("boards")) is True
