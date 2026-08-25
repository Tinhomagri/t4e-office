"""Testes de DjangoWorkspaceAccess.can_view_space.

Funções soltas, não classes — segue o padrão do restante da suíte.
"""
import pytest

from contexts.copilot.infrastructure.django.repositories_impl import (
    DjangoWorkspaceAccess,
)
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
    admin = UserModel.objects.create_user(
        email="admin@t4e.com", password="x", full_name="Admin", is_active=True
    )
    unrestricted_member = UserModel.objects.create_user(
        email="livre@t4e.com", password="x", full_name="Livre", is_active=True
    )
    restricted_member = UserModel.objects.create_user(
        email="restrito@t4e.com", password="x", full_name="Restrito", is_active=True
    )
    blocked_member = UserModel.objects.create_user(
        email="bloqueado@t4e.com", password="x", full_name="Bloqueado", is_active=True
    )
    ws = WorkspaceModel.objects.create(name="WS", slug="ws-access", owner=owner)
    MembershipModel.objects.create(workspace=ws, user=owner, role="owner")
    MembershipModel.objects.create(workspace=ws, user=admin, role="admin")
    MembershipModel.objects.create(
        workspace=ws, user=unrestricted_member, role="member", allowed_spaces=None
    )
    MembershipModel.objects.create(
        workspace=ws, user=restricted_member, role="member", allowed_spaces=["boards"]
    )
    MembershipModel.objects.create(
        workspace=ws, user=blocked_member, role="member", allowed_spaces=[]
    )
    return {
        "ws": ws,
        "owner": owner,
        "admin": admin,
        "unrestricted_member": unrestricted_member,
        "restricted_member": restricted_member,
        "blocked_member": blocked_member,
    }


def test_owner_ve_space_restrito(scenario):
    access = DjangoWorkspaceAccess()
    assert access.can_view_space(
        workspace_id=str(scenario["ws"].id),
        user_id=str(scenario["owner"].id),
        space="marketing",
    ) is True


def test_admin_ve_space_restrito(scenario):
    access = DjangoWorkspaceAccess()
    assert access.can_view_space(
        workspace_id=str(scenario["ws"].id),
        user_id=str(scenario["admin"].id),
        space="comercial",
    ) is True


def test_membro_sem_restricao_ve_tudo(scenario):
    access = DjangoWorkspaceAccess()
    for space in ("boards", "marketing", "comercial"):
        assert access.can_view_space(
            workspace_id=str(scenario["ws"].id),
            user_id=str(scenario["unrestricted_member"].id),
            space=space,
        ) is True


def test_membro_restrito_a_boards_nao_ve_marketing(scenario):
    access = DjangoWorkspaceAccess()
    assert access.can_view_space(
        workspace_id=str(scenario["ws"].id),
        user_id=str(scenario["restricted_member"].id),
        space="boards",
    ) is True
    assert access.can_view_space(
        workspace_id=str(scenario["ws"].id),
        user_id=str(scenario["restricted_member"].id),
        space="marketing",
    ) is False


def test_membro_com_lista_vazia_nao_ve_nada(scenario):
    access = DjangoWorkspaceAccess()
    for space in ("boards", "marketing", "comercial"):
        assert access.can_view_space(
            workspace_id=str(scenario["ws"].id),
            user_id=str(scenario["blocked_member"].id),
            space=space,
        ) is False


def test_nao_membro_e_negado(scenario, db):
    outsider = UserModel.objects.create_user(
        email="fora@t4e.com", password="x", full_name="Fora", is_active=True
    )
    access = DjangoWorkspaceAccess()
    assert access.can_view_space(
        workspace_id=str(scenario["ws"].id), user_id=str(outsider.id), space="boards"
    ) is False
