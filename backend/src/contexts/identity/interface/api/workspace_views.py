"""Views de membros e convites de workspace."""
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from contexts.identity.application.use_cases.accept_invitation import AcceptInvitation
from contexts.identity.application.use_cases.list_invitations import ListInvitations
from contexts.identity.application.use_cases.list_members import ListMembers
from contexts.identity.application.use_cases.remove_member import RemoveMember
from contexts.identity.application.use_cases.revoke_invitation import RevokeInvitation
from contexts.identity.application.use_cases.send_invitation import SendInvitation
from contexts.identity.application.use_cases.update_member_role import UpdateMemberRole
from contexts.identity.infrastructure.django.email_sender_impl import DjangoEmailSender
from contexts.identity.infrastructure.django.models import (
    InvitationModel,
    RoleAuditLog,
    UserModel,
)
from contexts.identity.infrastructure.django.repositories_impl import (
    DjangoInvitationRepository,
    DjangoMembershipRepository,
    DjangoWorkspaceRepository,
)
from contexts.identity.interface.api.serializers import (
    AcceptInvitationSerializer,
    CreateInvitationSerializer,
    InvitationSerializer,
    MemberSerializer,
    UpdateMemberRoleSerializer,
)
from shared.domain.errors import PermissionDeniedError


def _invitation_dict(inv) -> dict:
    return {
        "id": inv.id,
        "email": str(inv.email),
        "role": inv.role.value,
        "status": inv.status.value,
    }


class MembersView(APIView):
    """Lista membros: GET /api/auth/workspaces/<id>/members/."""

    permission_classes = [IsAuthenticated]

    def get(self, request: Request, workspace_id: str) -> Response:
        members = ListMembers(DjangoMembershipRepository()).execute(
            workspace_id=str(workspace_id), actor_id=str(request.user.id)
        )
        data = MemberSerializer(
            [
                {"user_id": m.user_id, "name": m.name, "email": m.email, "role": m.role, "avatar_url": m.avatar_url}
                for m in members
            ],
            many=True,
        ).data
        return Response(data)


class MemberDetailView(APIView):
    """Alterar papel / remover membro: PATCH|DELETE /api/auth/workspaces/<id>/members/<user_id>/."""

    permission_classes = [IsAuthenticated]

    def patch(self, request: Request, workspace_id: str, user_id: str) -> Response:
        serializer = UpdateMemberRoleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        new_role = serializer.validated_data["role"]

        repo = DjangoMembershipRepository()

        # Captura papel atual para o audit log
        old_role_obj = repo.role_of(workspace_id=str(workspace_id), user_id=str(user_id))
        old_role_str = old_role_obj.value if old_role_obj else ""

        UpdateMemberRole(repo).execute(
            workspace_id=str(workspace_id),
            actor_id=str(request.user.id),
            target_user_id=str(user_id),
            new_role=new_role,
        )

        # Audit trail
        RoleAuditLog.objects.create(
            workspace_id=str(workspace_id),
            actor_id=str(request.user.id),
            target_user_id=str(user_id),
            action="role_changed",
            old_role=old_role_str,
            new_role=new_role,
        )

        return Response({"user_id": str(user_id), "role": new_role})

    def delete(self, request: Request, workspace_id: str, user_id: str) -> Response:
        repo = DjangoMembershipRepository()

        # Captura papel atual para o audit log
        old_role_obj = repo.role_of(workspace_id=str(workspace_id), user_id=str(user_id))
        old_role_str = old_role_obj.value if old_role_obj else ""

        RemoveMember(repo).execute(
            workspace_id=str(workspace_id),
            actor_id=str(request.user.id),
            target_user_id=str(user_id),
        )

        # Audit trail
        RoleAuditLog.objects.create(
            workspace_id=str(workspace_id),
            actor_id=str(request.user.id),
            target_user_id=str(user_id),
            action="member_removed",
            old_role=old_role_str,
            new_role="",
        )

        return Response(status=status.HTTP_204_NO_CONTENT)


class AuditLogView(APIView):
    """Lista o log de auditoria: GET /api/auth/workspaces/<id>/audit-log/.

    Apenas owner/admin podem consultar.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request: Request, workspace_id: str) -> Response:
        repo = DjangoMembershipRepository()
        actor_role = repo.role_of(
            workspace_id=str(workspace_id), user_id=str(request.user.id)
        )
        if actor_role is None or not actor_role.can_manage_members:
            raise PermissionDeniedError("Apenas owner ou admin podem ver o audit log.")

        logs = RoleAuditLog.objects.filter(workspace_id=str(workspace_id)).values(
            "id",
            "actor_id",
            "target_user_id",
            "action",
            "old_role",
            "new_role",
            "created_at",
        )
        return Response(list(logs))


class InvitationListCreateView(APIView):
    """Convites: GET/POST /api/auth/workspaces/<id>/invitations/."""

    permission_classes = [IsAuthenticated]

    def get(self, request: Request, workspace_id: str) -> Response:
        use_case = ListInvitations(
            DjangoInvitationRepository(), DjangoMembershipRepository()
        )
        invitations = use_case.execute(
            workspace_id=str(workspace_id), actor_id=str(request.user.id)
        )
        return Response(
            InvitationSerializer(
                [_invitation_dict(i) for i in invitations], many=True
            ).data
        )

    def post(self, request: Request, workspace_id: str) -> Response:
        serializer = CreateInvitationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        use_case = SendInvitation(
            DjangoInvitationRepository(),
            DjangoMembershipRepository(),
            DjangoWorkspaceRepository(),
            DjangoEmailSender(),
        )
        inv = use_case.execute(
            workspace_id=str(workspace_id),
            email=serializer.validated_data["email"],
            role=serializer.validated_data["role"],
            actor_id=str(request.user.id),
            inviter_name=request.user.full_name,
        )
        return Response(
            InvitationSerializer(_invitation_dict(inv)).data,
            status=status.HTTP_201_CREATED,
        )


class AcceptInvitationView(APIView):
    """Aceitar convite: POST /api/auth/invitations/accept/ (body: token)."""

    permission_classes = [IsAuthenticated]

    def post(self, request: Request) -> Response:
        serializer = AcceptInvitationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        use_case = AcceptInvitation(
            DjangoInvitationRepository(), DjangoMembershipRepository()
        )
        result = use_case.execute(
            token=serializer.validated_data["token"],
            actor_id=str(request.user.id),
            actor_email=request.user.email,
        )
        return Response({"workspace_id": result.workspace_id, "role": result.role})


class InvitationPreviewView(APIView):
    """Dados do convite antes do login: GET /api/auth/invitations/preview/?token=

    Sem autenticação de propósito — é a tela que a pessoa vê ANTES de entrar. O
    token (UUID) é a credencial: quem o tem recebeu o e-mail, então devolver o
    endereço não conta como enumeração de contas. É isso que permite à tela
    decidir entre login e cadastro em vez de largar dois botões e deixar o
    usuário adivinhar.
    """

    permission_classes = [AllowAny]

    def get(self, request: Request) -> Response:
        token = str(request.query_params.get("token", "")).strip()
        if not token:
            return Response({"error": "Token obrigatório."}, status=400)

        invitation = InvitationModel.objects.filter(token=token).select_related(
            "workspace"
        ).first()
        if invitation is None:
            return Response({"error": "Convite não encontrado."}, status=404)

        user = UserModel.objects.filter(email__iexact=invitation.email).first()
        if user is None:
            auth_method = "none"
        elif user.has_usable_password():
            auth_method = "password"
        else:
            # Conta criada via OAuth: login por senha falharia com "credenciais
            # inválidas", sem dizer que o caminho é o botão do Google.
            auth_method = "google"

        return Response(
            {
                "workspace_name": invitation.workspace.name,
                "email": invitation.email,
                "role": invitation.role,
                "status": invitation.status,
                "account_exists": user is not None,
                "auth_method": auth_method,
            }
        )


class RevokeInvitationView(APIView):
    """Revogar convite: POST /api/auth/invitations/<id>/revoke/."""

    permission_classes = [IsAuthenticated]

    def post(self, request: Request, invitation_id: str) -> Response:
        use_case = RevokeInvitation(
            DjangoInvitationRepository(), DjangoMembershipRepository()
        )
        use_case.execute(
            invitation_id=str(invitation_id), actor_id=str(request.user.id)
        )
        return Response(status=status.HTTP_204_NO_CONTENT)
