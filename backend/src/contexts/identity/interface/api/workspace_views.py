"""Views de membros e convites de workspace."""
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from contexts.identity.application.use_cases.accept_invitation import AcceptInvitation
from contexts.identity.application.use_cases.list_invitations import ListInvitations
from contexts.identity.application.use_cases.list_members import ListMembers
from contexts.identity.application.use_cases.revoke_invitation import RevokeInvitation
from contexts.identity.application.use_cases.send_invitation import SendInvitation
from contexts.identity.infrastructure.django.email_sender_impl import DjangoEmailSender
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
)


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
                {"user_id": m.user_id, "name": m.name, "email": m.email, "role": m.role}
                for m in members
            ],
            many=True,
        ).data
        return Response(data)


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
