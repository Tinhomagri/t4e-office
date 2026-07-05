"""Views da Planning Poker API."""
import uuid

from django.db.models import Avg
from django.utils import timezone
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
from contexts.estimation.infrastructure.django.models import (
    PokerParticipantModel,
    PokerRoundModel,
    PokerSessionModel,
)
from contexts.identity.infrastructure.django.models import WorkspaceModel
from contexts.projects.infrastructure.django.models import CardModel
from contexts.projects.interface.api import capabilities as caps
from contexts.projects.interface.api.permissions import (
    assert_project_capability,
    assert_project_member,
)

_session_repo = DjangoPokerSessionRepository()
_participant_repo = DjangoPokerParticipantRepository()
_vote_repo = DjangoPokerVoteRepository()

# Valores válidos de pontuação final — mesmo deck usado na votação (sem "?").
DECK_POINTS = {1, 2, 3, 5, 8, 13, 21}


def _initials(name: str) -> str:
    parts = name.strip().split()
    if len(parts) >= 2:
        return (parts[0][0] + parts[-1][0]).upper()
    return name[:2].upper() if name else "??"


def _session_dict(session: PokerSession, *, with_counts: bool = False) -> dict:
    data = {
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
    if with_counts:
        rounds_qs = PokerRoundModel.objects.filter(session_id=session.id)
        data["rounds_count"] = rounds_qs.count()
        data["participants_count"] = PokerParticipantModel.objects.filter(
            session_id=session.id
        ).count()
        avg = rounds_qs.aggregate(avg=Avg("final_points"))["avg"]
        data["avg_points"] = round(avg, 1) if avg is not None else None
    return data


def _round_dict(r: PokerRoundModel) -> dict:
    return {
        "id": str(r.id),
        "session_id": str(r.session_id),
        "card_id": str(r.card_id),
        "card_ref": r.card_ref,
        "card_title": r.card_title,
        "final_points": r.final_points,
        "votes": r.votes,
        "decided_by_name": r.decided_by.full_name if r.decided_by_id else "",
        "decided_at": r.decided_at.isoformat(),
    }


def _participant_dict(p: PokerParticipant) -> dict:
    return {
        "id": p.id,
        "user_id": p.user_id,
        "user_name": p.user_name,
        "avatar_initials": p.avatar_initials,
        "is_host": p.is_host,
    }


def _vote_dict(v: PokerVote, revealed: bool, viewer_id: str) -> dict:
    # O próprio voto nunca é mascarado pra quem o deu — só o dos outros
    # fica oculto ("?") até a revelação, pra não influenciar quem falta votar.
    show_value = revealed or v.participant_id == viewer_id
    return {
        "participant_id": v.participant_id,
        "participant_name": v.participant_name,
        "value": v.value if show_value else ("?" if v.value is not None else None),
        "has_voted": v.value is not None,
    }


def _workspace_for_user(user_id: str) -> WorkspaceModel | None:
    return WorkspaceModel.objects.filter(accesses__user_id=user_id).first()


class PokerSessionListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: dict})
    def get(self, request: Request, workspace_id: str) -> Response:
        sessions = _session_repo.list_by_workspace(workspace_id)
        return Response([_session_dict(s, with_counts=True) for s in sessions])

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
        viewer_id = str(request.user.id)
        return Response({
            **_session_dict(session),
            "participants": [_participant_dict(p) for p in participants],
            "votes": [_vote_dict(v, revealed, viewer_id) for v in votes],
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


class ProjectPokerListCreateView(APIView):
    """Sala de poker a partir de um projeto/board.

    GET lista salas abertas do projeto (pra reentrar). POST cria sala nova
    já populada com os cards do backlog sem pontos (fluxo padrão de refino).
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: dict})
    def get(self, request: Request, project_id: str) -> Response:
        assert_project_member(project_id=str(project_id), user_id=str(request.user.id))
        sessions = _session_repo.list_by_project(str(project_id))
        return Response([_session_dict(s) for s in sessions])

    @extend_schema(request=dict, responses={201: dict})
    def post(self, request: Request, project_id: str) -> Response:
        project = assert_project_capability(
            project_id=str(project_id), user_id=str(request.user.id),
            capability=caps.MANAGE_SPRINTS,
        )
        name = request.data.get("name") or "Planning Poker"

        requested_ids = request.data.get("card_ids")
        if requested_ids:
            # Seleção explícita do board: mantém a ordem enviada, aceita só
            # cards do próprio projeto e descarta épicos.
            valid = set(
                str(c) for c in CardModel.objects.filter(
                    project_id=project_id, id__in=requested_ids
                ).exclude(type="epic").values_list("id", flat=True)
            )
            card_ids = [str(c) for c in requested_ids if str(c) in valid]
        else:
            card_ids = [
                str(c) for c in CardModel.objects.filter(
                    project_id=project_id, points__isnull=True
                )
                .exclude(type="epic")
                .order_by("rank", "number")
                .values_list("id", flat=True)
            ]

        session = _session_repo.create(
            PokerSession(
                id=None,
                workspace_id=str(project.workspace_id),
                project_id=str(project_id),
                created_by=str(request.user.id),
                name=name,
                card_ids=card_ids,
                current_card_id=card_ids[0] if card_ids else None,
            )
        )
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


class PokerApplyPointsView(APIView):
    """Host confirma o valor final da rodada: grava points no card e avança a fila."""

    permission_classes = [IsAuthenticated]

    @extend_schema(request=dict, responses={200: dict})
    def post(self, request: Request, session_id: str) -> Response:
        session = _session_repo.get(session_id)
        if not session:
            return Response({"error": "Sessão não encontrada"}, status=404)
        if str(request.user.id) != session.created_by:
            return Response({"error": "Apenas o host pode aplicar a pontuação"}, status=403)
        if not session.current_card_id:
            return Response({"error": "Nenhum card em votação"}, status=400)

        # Restrito aos valores do deck Fibonacci: rejeita decimais (99999.99),
        # negativos e valores fora de escala — sem isso um número quebrado
        # trincava no salvamento do card (PositiveSmallIntegerField no banco).
        raw_points = request.data.get("points")
        if not isinstance(raw_points, int) or isinstance(raw_points, bool) or raw_points not in DECK_POINTS:
            return Response(
                {"error": f"Pontuação inválida. Use um dos valores do deck: {sorted(DECK_POINTS)}."},
                status=400,
            )
        points = raw_points

        from contexts.projects.application.use_cases.update_card import UpdateCard
        from contexts.projects.infrastructure.django.repositories_impl import (
            DjangoCardRepository,
            DjangoHistoryRepository,
            DjangoProjectRepository,
            DjangoWorkspaceAccess,
        )

        UpdateCard(
            DjangoProjectRepository(),
            DjangoCardRepository(),
            DjangoWorkspaceAccess(),
            DjangoHistoryRepository(),
        ).execute(
            card_id=session.current_card_id,
            actor_id=str(request.user.id),
            points=points,
        )

        # Snapshot do resultado da rodada — preservado no histórico mesmo
        # depois que os votos "ao vivo" são limpos abaixo para a próxima carta.
        card = CardModel.objects.filter(id=session.current_card_id).select_related("project").first()
        cast_votes = _vote_repo.list_by_card(session_id, session.current_card_id)
        PokerRoundModel.objects.create(
            session_id=session_id,
            card_id=session.current_card_id,
            card_ref=f"{card.project.key}-{card.number}" if card else "",
            card_title=card.title if card else "",
            final_points=points,
            votes=[{"participant_name": v.participant_name, "value": v.value} for v in cast_votes],
            decided_by_id=request.user.id,
        )

        _vote_repo.clear_card(session_id, session.current_card_id)
        remaining = [c for c in session.card_ids if c != session.current_card_id]
        session.card_ids = remaining
        session.current_card_id = remaining[0] if remaining else None
        session.status = SessionStatus.VOTING if remaining else SessionStatus.DONE
        session = _session_repo.update(session)
        return Response(_session_dict(session))


class PokerWorkspaceSummaryView(APIView):
    """Resumo agregado do Planning Poker no workspace — estilo aba "Resumo"
    do Jira, mas para as sessões de estimativa: quanto foi votado, por quem,
    distribuição de pontos e atividade recente entre todas as salas."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: dict})
    def get(self, request: Request, workspace_id: str) -> Response:
        sessions_qs = PokerSessionModel.objects.filter(workspace_id=workspace_id)
        rounds_qs = PokerRoundModel.objects.filter(session__workspace_id=workspace_id).select_related(
            "session", "decided_by"
        )

        today = timezone.localdate()
        rounds_today = [r for r in rounds_qs if timezone.localtime(r.decided_at).date() == today]
        sessions_today = [s for s in sessions_qs if timezone.localtime(s.created_at).date() == today]

        avg = rounds_qs.aggregate(avg=Avg("final_points"))["avg"]

        distribution: dict[int, int] = {v: 0 for v in sorted(DECK_POINTS)}
        estimator_counts: dict[str, int] = {}
        for r in rounds_qs:
            distribution[r.final_points] = distribution.get(r.final_points, 0) + 1
            for v in r.votes:
                if v.get("value") is not None:
                    name = v.get("participant_name") or "?"
                    estimator_counts[name] = estimator_counts.get(name, 0) + 1

        top_estimators = sorted(estimator_counts.items(), key=lambda kv: kv[1], reverse=True)[:6]

        recent = sorted(rounds_qs, key=lambda r: r.decided_at, reverse=True)[:10]

        return Response({
            "sessions_total": sessions_qs.count(),
            "sessions_active": sessions_qs.exclude(status="done").count(),
            "sessions_today": len(sessions_today),
            "rounds_total": rounds_qs.count(),
            "rounds_today": len(rounds_today),
            "avg_points": round(avg, 1) if avg is not None else None,
            "points_distribution": [{"points": k, "count": v} for k, v in distribution.items()],
            "top_estimators": [{"name": n, "votes": c} for n, c in top_estimators],
            "recent_rounds": [
                {
                    **_round_dict(r),
                    "session_name": r.session.name,
                }
                for r in recent
            ],
        })


class PokerRoundListView(APIView):
    """Histórico de rodadas já decididas de uma sessão — o que foi votado,
    por quem, e a pontuação final aplicada em cada card."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: dict})
    def get(self, request: Request, session_id: str) -> Response:
        rounds = PokerRoundModel.objects.filter(session_id=session_id).select_related("decided_by")
        return Response([_round_dict(r) for r in rounds])


class PokerCardsView(APIView):
    """Lista cards do projeto para o host selecionar."""
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: dict})
    def get(self, request: Request, session_id: str) -> Response:
        session = _session_repo.get(session_id)
        if not session:
            return Response({"error": "Sessão não encontrada"}, status=404)
        # "ref" (ex.: MIA-142) não é campo do banco — é sempre calculado a
        # partir da key do projeto + number, nunca deu pra usar .values("ref").
        cards = (
            CardModel.objects.filter(project_id=session.project_id)
            .exclude(type="epic")
            .select_related("project")
            .order_by("rank", "number")
        )
        return Response([
            {
                "id": str(c.id),
                "title": c.title,
                "ref": f"{c.project.key}-{c.number}",
                "status": c.status,
                "points": c.points,
            }
            for c in cards
        ])
