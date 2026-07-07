"""Implementações Django dos repositórios do contexto identity."""
from contexts.identity.domain.entities.invitation import Invitation, InvitationStatus
from contexts.identity.domain.entities.user import User
from contexts.identity.domain.entities.workspace import Membership, Workspace
from contexts.identity.domain.repositories.invitation_repository import (
    InvitationRepository,
)
from contexts.identity.domain.repositories.user_repository import UserRepository
from contexts.identity.domain.repositories.workspace_repository import (
    MemberView,
    MembershipRepository,
    WorkspaceRepository,
)
from contexts.identity.domain.value_objects.email import Email
from contexts.identity.domain.value_objects.role import Role
from contexts.identity.infrastructure.django.models import (
    InvitationModel,
    MembershipModel,
    UserModel,
    WorkspaceModel,
)


def _to_workspace_entity(row: WorkspaceModel) -> Workspace:
    return Workspace(
        id=str(row.id), name=row.name, slug=row.slug, owner_id=str(row.owner_id)
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

    def create(
        self, *, email: Email, full_name: str, raw_password: str, is_active: bool = False
    ) -> User:
        # O manager hasheia a senha (set_password)
        row = UserModel.objects.create_user(
            email=str(email),
            password=raw_password,
            full_name=full_name,
            is_active=is_active,
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
        return _to_workspace_entity(row)

    def list_for_user(self, *, user_id: str) -> list[Workspace]:
        ws_ids = MembershipModel.objects.filter(user_id=user_id).values_list(
            "workspace_id", flat=True
        )
        rows = WorkspaceModel.objects.filter(id__in=list(ws_ids))
        return [_to_workspace_entity(r) for r in rows]

    def get(self, *, workspace_id: str) -> Workspace | None:
        row = WorkspaceModel.objects.filter(id=workspace_id).first()
        return _to_workspace_entity(row) if row else None


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

    def role_of(self, *, workspace_id: str, user_id: str) -> Role | None:
        row = MembershipModel.objects.filter(
            workspace_id=workspace_id, user_id=user_id
        ).first()
        return Role(row.role) if row else None

    def list_members(self, *, workspace_id: str) -> list[MemberView]:
        rows = MembershipModel.objects.filter(
            workspace_id=workspace_id
        ).select_related("user")
        return [
            MemberView(
                user_id=str(r.user_id),
                name=r.user.full_name,
                email=r.user.email,
                role=r.role,
            )
            for r in rows
        ]

    def update_role(self, *, workspace_id: str, user_id: str, new_role: Role) -> None:
        MembershipModel.objects.filter(
            workspace_id=workspace_id, user_id=user_id
        ).update(role=new_role.value)

    def remove(self, *, workspace_id: str, user_id: str) -> None:
        MembershipModel.objects.filter(
            workspace_id=workspace_id, user_id=user_id
        ).delete()

    def count_owners(self, *, workspace_id: str) -> int:
        return MembershipModel.objects.filter(
            workspace_id=workspace_id, role="owner"
        ).count()

    def update_role(self, *, workspace_id: str, user_id: str, new_role: Role) -> None:
        MembershipModel.objects.filter(
            workspace_id=workspace_id, user_id=user_id
        ).update(role=new_role.value)

    def remove(self, *, workspace_id: str, user_id: str) -> None:
        MembershipModel.objects.filter(
            workspace_id=workspace_id, user_id=user_id
        ).delete()

    def count_owners(self, *, workspace_id: str) -> int:
        return MembershipModel.objects.filter(
            workspace_id=workspace_id, role=Role.OWNER.value
        ).count()


class DjangoInvitationRepository(InvitationRepository):
    """Persistência de convites via Django ORM."""

    def create(self, *, invitation: Invitation) -> Invitation:
        row = InvitationModel.objects.create(
            workspace_id=invitation.workspace_id,
            email=str(invitation.email),
            role=invitation.role.value,
            token=invitation.token,
            status=invitation.status.value,
        )
        return _invitation_to_entity(row)

    def get(self, *, invitation_id: str) -> Invitation | None:
        row = InvitationModel.objects.filter(id=invitation_id).first()
        return _invitation_to_entity(row) if row else None

    def get_by_token(self, *, token: str) -> Invitation | None:
        row = InvitationModel.objects.filter(token=token).first()
        return _invitation_to_entity(row) if row else None

    def list_by_workspace(self, *, workspace_id: str) -> list[Invitation]:
        rows = InvitationModel.objects.filter(workspace_id=workspace_id).order_by(
            "-created_at"
        )
        return [_invitation_to_entity(r) for r in rows]

    def save(self, *, invitation: Invitation) -> Invitation:
        InvitationModel.objects.filter(id=invitation.id).update(
            status=invitation.status.value
        )
        return invitation

    def pending_exists(self, *, workspace_id: str, email: str) -> bool:
        return InvitationModel.objects.filter(
            workspace_id=workspace_id, email=email, status="pending"
        ).exists()


def _invitation_to_entity(row: InvitationModel) -> Invitation:
    return Invitation(
        id=str(row.id),
        workspace_id=str(row.workspace_id),
        email=Email(row.email),
        role=Role(row.role),
        token=row.token,
        status=InvitationStatus(row.status),
    )
