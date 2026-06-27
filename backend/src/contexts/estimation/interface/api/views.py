"""Views da Planning Poker API."""
import uuid

from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from contexts.estimation.domain.entities.poker_session import (
    PokerParticipant,
    PokerSession,
    PokerVote,
    SessionStatus,
)
from contexts.estimation.infrastructure.django.repositories_impl import (
    DjangoPokerParticipantRepository,
    DjangoPokerSessionRepository,
    DjangoPokerVoteRepository,
)
from contexts.identity.infrastructure.django.models import WorkspaceModel
from contexts.projects.infrastructure.django.models import CardModel

_session_repo = DjangoPokerSessionRepository()
_participant_repo = DjangoPokerParticipantRepository()
_vote_repo = DjangoPokerVoteRepository()


def _initials(name: str) -> str:
    parts = name.strip().split()
    if len(parts) >= 2:
        return (parts[0][0] + parts[-1][0]).upper()
    return name[:2].upper() if name else "??"


def _session_dict(session: PokerSession) -> dict:
    return {
        "id": session.id,
        "workspace_id": session.workspace_id,
        "project_id": session.project_id,
        "created_by": session.created_by,
        "name": session.name,
        "status": session.status.value,
        "current_card_id": session.current_card_id,
        "card_ids": session.card_ids,
        "created_at": session.created_at.isoformat() if session.created_at else None,
    }


def _participant_dict(p: PokerParticipant) -> dict:
    return {
        "id": p.id,
        "user_id": p.user_id,
        "user_name": p.user_name,
        "avatar_initials": p.avatar_initials,
        "is_host": p.is_host,
    }


def _vote_dict(v: PokerVote, revealed: bool) -> dict:
    return {
        "participant_id": v.participant_id,
        "participant_name": v.participant_name,
        "value": v.value if revealed else ("?" if v.value is not None else None),
        "has_voted": v.value is not None,
    }


def _workspace_for_user(user_id: str) -> WorkspaceModel | None:
    return WorkspaceModel.objects.filter(accesses__user_id=user_id).first()


class PokerSessionListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: dict})
    def get(self, request: Request, workspace_id: str) -> Response:
        sessions = _session_repo.list_by_workspace(workspace_id)
        return Response([_session_dict(s) for s in sessions])

    @extend_schema(request=dict, responses={201: dict})
    def post(self, request: Request, workspace_id: str) -> Response:
        project_id = request.data.get("project_id")
        name = request.data.get("name", "Planning Poker")
        if not project_id:
            return Response({"error": "project_id obrigatório"}, status=400)

        session = _session_repo.create(
            PokerSession(
                id=None,
                workspace_id=workspace_id,
                project_id=project_id,
                created_by=str(request.user.id),
                name=name,
            )
        )
        # host entra automaticamente
        _participant_repo.join(
            PokerParticipant(
                id=None,
                session_id=session.id,
                user_id=str(request.user.id),
                user_name=request.user.full_name,
                avatar_initials=_initials(request.user.full_name),
                is_host=True,
            )
        )
        return Response(_session_dict(session), status=status.HTTP_201_CREATED)


class PokerSessionDetailView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: dict})
    def get(self, request: Request, session_id: str) -> Response:
        session = _session_repo.get(session_id)
        if not session:
            return Response({"error": "Sessão não encontrada"}, status=404)
        participants = _participant_repo.list_active(session_id)
        votes = []
        if session.current_card_id:
            votes = _vote_repo.list_by_card(session_id, session.current_card_id)
        revealed = session.status == SessionStatus.REVEALED
        return Response({
            **_session_dict(session),
            "participants": [_participant_dict(p) for p in participants],
            "votes": [_vote_dict(v, revealed) for v in votes],
        })

    @extend_schema(request=dict, responses={200: dict})
    def patch(self, request: Request, session_id: str) -> Response:
        """Host atualiza status, current_card_id ou card_ids."""
        session = _session_repo.get(session_id)
        if not session:
            return Response({"error": "Sessão não encontrada"}, status=404)
        if str(request.user.id) != session.created_by:
            return Response({"error": "Apenas o host pode alterar a sessão"}, status=403)

        if "status" in request.data:
            session.status = SessionStatus(request.data["status"])
        if "current_card_id" in request.data:
            session.current_card_id = request.data["current_card_id"]
        if "card_ids" in request.data:
            session.card_ids = request.data["card_ids"]

        session = _session_repo.update(session)
        return Response(_session_dict(session))


class PokerJoinView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: dict})
    def post(self, request: Request, session_id: str) -> Response:
        session = _session_repo.get(session_id)
        if not session:
            return Response({"error": "Sessão não encontrada"}, status=404)

        participant = _participant_repo.join(
            PokerParticipant(
                id=None,
                session_id=session_id,
                user_id=str(request.user.id),
                user_name=request.user.full_name,
                avatar_initials=_initials(request.user.full_name),
                is_host=session.created_by == str(request.user.id),
            )
        )
        return Response(_participant_dict(participant))


class PokerHeartbeatView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={204: None})
    def post(self, request: Request, session_id: str) -> Response:
        _participant_repo.touch(session_id, str(request.user.id))
        return Response(status=status.HTTP_204_NO_CONTENT)


class PokerVoteView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=dict, responses={200: dict})
    def post(self, request: Request, session_id: str) -> Response:
        session = _session_repo.get(session_id)
        if not session or not session.current_card_id:
            return Response({"error": "Nenhum card em votação"}, status=400)
        if session.status not in (SessionStatus.VOTING,):
            return Response({"error": "Votação não está aberta"}, status=400)

        value = request.data.get("value")
        vote = _vote_repo.upsert(
            PokerVote(
                id=None,
                session_id=session_id,
                card_id=session.current_card_id,
                participant_id=str(request.user.id),
                value=value,
            )
        )
        return Response({"value": vote.value})


class PokerCardsView(APIView):
    """Lista cards do projeto para o host selecionar."""
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: dict})
    def get(self, request: Request, session_id: str) -> Response:
        session = _session_repo.get(session_id)
        if not session:
            return Response({"error": "Sessão não encontrada"}, status=404)
        cards = CardModel.objects.filter(
            project_id=session.project_id
        ).values("id", "title", "ref", "status", "points")
        return Response(list(cards))
