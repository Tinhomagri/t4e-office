"""Testes do UpdateMemberSpaces com repositório falso em memória (sem DB)."""
import pytest

from contexts.identity.application.use_cases.update_member_spaces import (
    UpdateMemberSpaces,
)
from contexts.identity.domain.repositories.workspace_repository import (
    MemberView,
    MembershipRepository,
)
from contexts.identity.domain.value_objects.role import Role
from shared.domain.errors import NotFoundError, PermissionDeniedError, ValidationError


class FakeMembershipRepository(MembershipRepository):
    """Repositório em memória: mapeia (workspace_id, user_id) -> (role, spaces)."""

    def __init__(self):
        self._roles: dict[tuple[str, str], Role] = {}
        self._spaces: dict[tuple[str, str], list[str] | None] = {}

    def set_member(self, workspace_id, user_id, role: Role, allowed_spaces=None):
        self._roles[(workspace_id, user_id)] = role
        self._spaces[(workspace_id, user_id)] = allowed_spaces

    def add(self, *, workspace_id, user_id, role):
        self.set_member(workspace_id, user_id, role)

    def exists(self, *, workspace_id, user_id):
        return (workspace_id, user_id) in self._roles

    def role_of(self, *, workspace_id, user_id):
        return self._roles.get((workspace_id, user_id))

    def list_members(self, *, workspace_id):
        return [
            MemberView(
                user_id=uid,
                name=uid,
                email=f"{uid}@t4e.com",
                role=role.value,
                allowed_spaces=self._spaces.get((wid, uid)),
            )
            for (wid, uid), role in self._roles.items()
            if wid == workspace_id
        ]

    def update_role(self, *, workspace_id, user_id, new_role):
        self._roles[(workspace_id, user_id)] = new_role

    def update_allowed_spaces(self, *, workspace_id, user_id, allowed_spaces):
        self._spaces[(workspace_id, user_id)] = allowed_spaces

    def remove(self, *, workspace_id, user_id):
        self._roles.pop((workspace_id, user_id), None)
        self._spaces.pop((workspace_id, user_id), None)

    def count_owners(self, *, workspace_id):
        return sum(
            1
            for (wid, _uid), role in self._roles.items()
            if wid == workspace_id and role == Role.OWNER
        )


WS = "ws-1"


def _repo_with(owner="owner-1", member="member-1", member_role=Role.MEMBER):
    repo = FakeMembershipRepository()
    repo.set_member(WS, owner, Role.OWNER)
    repo.set_member(WS, member, member_role)
    return repo


def test_owner_restringe_membro_a_um_space():
    repo = _repo_with()
    UpdateMemberSpaces(repo).execute(
        workspace_id=WS, actor_id="owner-1", target_user_id="member-1",
        allowed_spaces=["boards"],
    )
    assert repo._spaces[(WS, "member-1")] == ["boards"]


def test_lista_vazia_e_permitida_e_distinta_de_null():
    repo = _repo_with()
    UpdateMemberSpaces(repo).execute(
        workspace_id=WS, actor_id="owner-1", target_user_id="member-1",
        allowed_spaces=[],
    )
    assert repo._spaces[(WS, "member-1")] == []


def test_rejeita_space_desconhecido():
    repo = _repo_with()
    with pytest.raises(ValidationError):
        UpdateMemberSpaces(repo).execute(
            workspace_id=WS, actor_id="owner-1", target_user_id="member-1",
            allowed_spaces=["boards", "invalido"],
        )


def test_actor_nao_admin_e_negado():
    repo = _repo_with()
    repo.set_member(WS, "member-2", Role.MEMBER)
    with pytest.raises(PermissionDeniedError):
        UpdateMemberSpaces(repo).execute(
            workspace_id=WS, actor_id="member-1", target_user_id="member-2",
            allowed_spaces=["boards"],
        )


def test_admin_nao_pode_alterar_spaces():
    repo = _repo_with()
    repo.set_member(WS, "admin-1", Role.ADMIN)
    with pytest.raises(PermissionDeniedError):
        UpdateMemberSpaces(repo).execute(
            workspace_id=WS, actor_id="admin-1", target_user_id="member-1",
            allowed_spaces=["marketing"],
        )


def test_membro_alvo_inexistente_e_404():
    repo = _repo_with()
    with pytest.raises(NotFoundError):
        UpdateMemberSpaces(repo).execute(
            workspace_id=WS, actor_id="owner-1", target_user_id="ninguem",
            allowed_spaces=["boards"],
        )
