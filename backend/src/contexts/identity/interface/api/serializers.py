"""Serializers do contexto identity — apenas validação de formato/IO."""
from rest_framework import serializers


class RegisterSerializer(serializers.Serializer):
    """Payload de cadastro de usuário."""

    email = serializers.EmailField()
    full_name = serializers.CharField(max_length=200)
    password = serializers.CharField(write_only=True, min_length=8)


class UserSerializer(serializers.Serializer):
    """Representação pública do usuário."""

    id = serializers.CharField()
    email = serializers.EmailField()
    full_name = serializers.CharField()
    avatar_url = serializers.CharField(allow_blank=True, allow_null=True, required=False)
    job_title = serializers.CharField(allow_blank=True, required=False)
    phone = serializers.CharField(allow_blank=True, required=False)
    bio = serializers.CharField(allow_blank=True, required=False)
    location = serializers.CharField(allow_blank=True, required=False)
    timezone = serializers.CharField(allow_blank=True, required=False)
    language = serializers.CharField(allow_blank=True, required=False)
    theme = serializers.CharField(allow_blank=True, required=False)
    density = serializers.CharField(allow_blank=True, required=False)
    notification_preferences = serializers.DictField(required=False)
    availability = serializers.CharField(allow_blank=True, required=False)


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True, allow_blank=True)
    new_password = serializers.CharField(write_only=True, min_length=8)


class CreateWorkspaceSerializer(serializers.Serializer):
    """Payload de criação de workspace."""

    name = serializers.CharField(max_length=120)


class WorkspaceSerializer(serializers.Serializer):
    """Representação pública do workspace."""

    id = serializers.CharField(source="workspace_id")
    name = serializers.CharField()
    slug = serializers.CharField()


class WorkspaceListItemSerializer(serializers.Serializer):
    """Item de listagem de workspace (entidade Workspace)."""

    id = serializers.CharField()
    name = serializers.CharField()
    slug = serializers.CharField()


class MemberSerializer(serializers.Serializer):
    """Membro de um workspace."""

    user_id = serializers.CharField()
    name = serializers.CharField()
    email = serializers.EmailField()
    role = serializers.CharField()
    avatar_url = serializers.CharField(allow_blank=True, allow_null=True, required=False)


_ROLES = ["admin", "member"]


class CreateInvitationSerializer(serializers.Serializer):
    """Payload de envio de convite."""

    email = serializers.EmailField()
    role = serializers.ChoiceField(choices=_ROLES, default="member")


class InvitationSerializer(serializers.Serializer):
    """Representação pública do convite."""

    id = serializers.CharField()
    email = serializers.EmailField()
    role = serializers.CharField()
    status = serializers.CharField()


class AcceptInvitationSerializer(serializers.Serializer):
    """Payload de aceite de convite."""

    token = serializers.CharField()


class UpdateMemberRoleSerializer(serializers.Serializer):
    """Payload de alteração de papel de membro.

    Owner não pode ser atribuído via PATCH — é papel de criação de workspace.
    """

    role = serializers.ChoiceField(choices=["admin", "member"])


class AuditLogSerializer(serializers.Serializer):
    """Representação pública de uma entrada do audit log."""

    id = serializers.CharField()
    actor_id = serializers.CharField()
    target_user_id = serializers.CharField()
    action = serializers.CharField()
    old_role = serializers.CharField()
    new_role = serializers.CharField()
    created_at = serializers.DateTimeField()
