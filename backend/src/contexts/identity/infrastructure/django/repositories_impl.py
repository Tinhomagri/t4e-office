"""Implementações Django dos repositórios do contexto identity."""
from contexts.identity.domain.entities.user import User
from contexts.identity.domain.entities.workspace import Membership, Workspace
from contexts.identity.domain.repositories.user_repository import UserRepository
from contexts.identity.domain.repositories.workspace_repository import (
    MembershipRepository,
    WorkspaceRepository,
)
from contexts.identity.domain.value_objects.email import Email
from contexts.identity.domain.value_objects.role import Role
from contexts.identity.infrastructure.django.models import (
    MembershipModel,
    UserModel,
    WorkspaceModel,
)


def _to_user_entity(row: UserModel) -> User:
    """Traduz o model ORM para a entidade de domínio."""
    return User(
        id=str(row.id),
        email=Email(row.email),
        full_name=row.full_name,
        is_active=row.is_active,
    )


class DjangoUserRepository(UserRepository):
    """Persistência de usuários via Django ORM."""

    def exists_by_email(self, email: Email) -> bool:
        return UserModel.objects.filter(email=str(email)).exists()

    def create(self, *, email: Email, full_name: str, raw_password: str) -> User:
        # O manager hasheia a senha (set_password)
        row = UserModel.objects.create_user(
            email=str(email), password=raw_password, full_name=full_name
        )
        return _to_user_entity(row)

    def get_by_email(self, email: Email) -> User | None:
        row = UserModel.objects.filter(email=str(email)).first()
        return _to_user_entity(row) if row else None


class DjangoWorkspaceRepository(WorkspaceRepository):
    """Persistência de workspaces via Django ORM."""

    def slug_exists(self, slug: str) -> bool:
        return WorkspaceModel.objects.filter(slug=slug).exists()

    def create(self, *, name: str, slug: str, owner_id: str) -> Workspace:
        row = WorkspaceModel.objects.create(name=name, slug=slug, owner_id=owner_id)
        return Workspace(
            id=str(row.id), name=row.name, slug=row.slug, owner_id=str(row.owner_id)
        )


class DjangoMembershipRepository(MembershipRepository):
    """Persistência de vínculos via Django ORM."""

    def add(self, *, workspace_id: str, user_id: str, role: Role) -> Membership:
        row = MembershipModel.objects.create(
            workspace_id=workspace_id, user_id=user_id, role=role.value
        )
        return Membership(
            id=str(row.id),
            workspace_id=str(row.workspace_id),
            user_id=str(row.user_id),
            role=Role(row.role),
        )

    def exists(self, *, workspace_id: str, user_id: str) -> bool:
        return MembershipModel.objects.filter(
            workspace_id=workspace_id, user_id=user_id
        ).exists()
