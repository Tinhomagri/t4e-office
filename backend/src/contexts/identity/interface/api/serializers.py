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
    allowed_spaces = serializers.ListField(
        child=serializers.CharField(), allow_null=True, required=False
    )


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
    """Payload de alteração de papel e/ou spaces de um membro.

    Owner não pode ser atribuído via PATCH — é papel de criação de workspace.
    `role` e `allowed_spaces` são ambos opcionais, mas ao menos um deve vir
    presente no payload (validado em `validate`, pois não dá pra expressar
    "presença" com `required` em campos individualmente opcionais).
    `allowed_spaces=null` explícito é uma entrada válida (remove restrição);
    por isso o campo aceita `allow_null` e distinguimos "ausente" checando
    `"allowed_spaces" in self.initial_data`.
    """

    role = serializers.ChoiceField(choices=["admin", "member"], required=False)
    allowed_spaces = serializers.ListField(
        child=serializers.ChoiceField(choices=["boards", "marketing", "comercial"]),
        allow_null=True,
        required=False,
    )

    def validate(self, attrs):
        if "role" not in self.initial_data and "allowed_spaces" not in self.initial_data:
            raise serializers.ValidationError(
                "Informe ao menos um campo: role ou allowed_spaces."
            )
        return attrs


class AuditLogSerializer(serializers.Serializer):
    """Representação pública de uma entrada do audit log."""

    id = serializers.CharField()
    actor_id = serializers.CharField()
    target_user_id = serializers.CharField()
    action = serializers.CharField()
    old_role = serializers.CharField()
    new_role = serializers.CharField()
    created_at = serializers.DateTimeField()
