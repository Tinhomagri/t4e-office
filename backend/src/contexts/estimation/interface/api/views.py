"""Views da Planning Poker API."""

from datetime import timedelta

from django.db.models import Avg, Q
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from contexts.estimation.application import read_services
from contexts.estimation.domain.entities.poker_session import (
    PokerParticipant,
    PokerSession,
    PokerVote,
    SessionStatus,
)
from contexts.estimation.infrastructure.django.models import (
    PokerParticipantModel,
    PokerReactionModel,
    PokerRoundModel,
    SquadMemberModel,
    SquadModel,
)
from contexts.estimation.infrastructure.django.repositories_impl import (
    DjangoPokerParticipantRepository,
    DjangoPokerSessionRepository,
    DjangoPokerVoteRepository,
)
from contexts.identity.infrastructure.django.models import (
    MembershipModel,
    WorkspaceModel,
)
from contexts.presence.infrastructure.django.models import UserAvatarModel
from contexts.projects.infrastructure.django.models import CardModel, WorkflowStatusModel
from contexts.projects.interface.api import capabilities as caps
from contexts.projects.interface.api.permissions import (
    assert_project_capability,
    assert_project_member,
)
from shared.domain.errors import PermissionDeniedError

_session_repo = DjangoPokerSessionRepository()
_participant_repo = DjangoPokerParticipantRepository()
_vote_repo = DjangoPokerVoteRepository()

# Valores válidos de pontuação final — mesmo deck usado na votação (sem "?").
DECK_POINTS = read_services.DECK_POINTS


def _exclude_completed_cards(cards, *, workspace_id: str):
    """Tira da estimativa qualquer card que já chegou ao fim do workflow.

    Não basta testar `status="done"`: cada projeto pode nomear a coluna final
    como Entregue, Publicado etc. O workflow é a fonte de verdade.
    """
    completed = Q(status__in=("done", "publicado"))
    for project_id, slug in WorkflowStatusModel.objects.filter(
        project__workspace_id=workspace_id
    ).filter(Q(category="done") | Q(is_done=True)).values_list("project_id", "slug"):
        completed |= Q(project_id=project_id, status=slug)
    return cards.exclude(completed)


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
        "squad_id": session.squad_id,
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


def _participant_dict(p: PokerParticipant, avatars: dict | None = None) -> dict:
    return {
        "id": p.id,
        "user_id": p.user_id,
        "user_name": p.user_name,
        "avatar_initials": p.avatar_initials,
        "is_host": p.is_host,
        # Sprite pixel-art da pessoa (mesmo avatar do Escritório). `None` para
        # quem nunca criou um — o front cai nas iniciais e oferece criar.
        "avatar_config": (avatars or {}).get(p.user_id),
    }


def _avatars_for(participants: list[PokerParticipant]) -> dict[str, dict]:
    """Config de avatar de todos os participantes numa query só.

    Buscar dentro de `_participant_dict` daria um SELECT por assento numa rota
    que o cliente chama a cada 2 segundos.
    """
    ids = [p.user_id for p in participants]
    rows = UserAvatarModel.objects.filter(user_id__in=ids).values_list(
        "user_id", "config"
    )
    return {str(uid): config for uid, config in rows}


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


# Janela de vida de uma reação. O cliente faz poll de 2s, então precisa ser
# folgada o bastante para ninguém perder a animação por causa do intervalo, e
# curta o bastante para a mesma reação não voar duas vezes na tela.
REACTION_WINDOW = timedelta(seconds=6)
# Depois disso a linha não serve mais para nada — o POST aproveita a passagem
# para limpar, o que dispensa uma tarefa agendada só para isso.
REACTION_TTL = timedelta(minutes=5)


def _reaction_dict(r: PokerReactionModel) -> dict:
    return {
        "id": str(r.id),
        "from_user_id": str(r.from_user_id),
        "to_user_id": str(r.to_user_id) if r.to_user_id else None,
        "emoji": r.emoji,
        "emote": r.emote,
        "created_at": r.created_at.isoformat(),
    }


def _recent_reactions(session_id: str) -> list[dict]:
    since = timezone.now() - REACTION_WINDOW
    qs = PokerReactionModel.objects.filter(session_id=session_id, created_at__gte=since)
    return [_reaction_dict(r) for r in qs]


def _workspace_for_user(user_id: str) -> WorkspaceModel | None:
    return WorkspaceModel.objects.filter(accesses__user_id=user_id).first()



def _session_or_404(session_id: str, user_id: str) -> PokerSession | None:
    """Carrega a sala garantindo que o usuário pertence ao workspace dela.

    Sem isto qualquer usuário autenticado com o link lia e votava numa sala de
    projeto alheio — as demais rotas do contexto já passavam por
    `assert_project_member`, estas tinham ficado de fora.
    """
    session = _session_repo.get(session_id)
    if session is None:
        return None
    # Pertencimento ao WORKSPACE da sessão, não ao projeto: a sala de
    # estimativa é do time. A sessão da squad nem tem projeto, e um board
    # restrito não deve impedir quem foi chamado para estimar de votar — o
    # acesso ao board continua valendo para ver e editar os cards.
    if not MembershipModel.objects.filter(
        workspace_id=session.workspace_id, user_id=user_id
    ).exists():
        raise PermissionDeniedError("Você não tem acesso a esta sala.")
    return session


class PokerSessionListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: dict})
    def get(self, request: Request, workspace_id: str) -> Response:
        sessions = _session_repo.list_by_workspace(workspace_id)
        return Response([_session_dict(s, with_counts=True) for s in sessions])

    @extend_schema(request=dict, responses={201: dict})
    def post(self, request: Request, workspace_id: str) -> Response:
        project_id = request.data.get("project_id")
        squad_id = request.data.get("squad_id")
        name = request.data.get("name", "Planning Poker")
        # Squad OU projeto: a sessão é do time, e o projeto é só o contexto de
        # quem abriu a sala a partir de um board. Exigir os dois obrigaria a
        # abrir uma sessão por projeto, que é o que queríamos acabar.
        if not project_id and not squad_id:
            return Response({"error": "Informe a squad ou o projeto."}, status=400)
        if squad_id and not SquadModel.objects.filter(
            id=squad_id, workspace_id=workspace_id
        ).exists():
            return Response({"error": "Squad não pertence a este workspace."}, status=400)

        session = _session_repo.create(
            PokerSession(
                id=None,
                workspace_id=workspace_id,
                project_id=project_id,
                squad_id=squad_id,
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
        session = _session_or_404(session_id, str(request.user.id))
        if not session:
            return Response({"error": "Sessão não encontrada"}, status=404)
        participants = _participant_repo.list_active(session_id)
        avatars = _avatars_for(participants)
        votes = []
        if session.current_card_id:
            votes = _vote_repo.list_by_card(session_id, session.current_card_id)
        revealed = session.status == SessionStatus.REVEALED
        viewer_id = str(request.user.id)
        return Response({
            **_session_dict(session),
            "participants": [_participant_dict(p, avatars) for p in participants],
            "votes": [_vote_dict(v, revealed, viewer_id) for v in votes],
            # Vão junto do detalhe (que já roda em poll de 2s) em vez de num
            # endpoint próprio: uma reação só vale animada, e um segundo poll
            # dobraria o tráfego da sala para transportar quase sempre nada.
            "reactions": _recent_reactions(session_id),
        })

    @extend_schema(request=dict, responses={200: dict})
    def patch(self, request: Request, session_id: str) -> Response:
        """Host atualiza status, current_card_id ou card_ids."""
        session = _session_or_404(session_id, str(request.user.id))
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
        session = _session_or_404(session_id, str(request.user.id))
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


class PokerLeaveView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={204: None})
    def post(self, request: Request, session_id: str) -> Response:
        session = _session_or_404(session_id, str(request.user.id))
        if not session:
            return Response({"error": "Sessão não encontrada"}, status=404)
        _participant_repo.leave(session_id, str(request.user.id))
        return Response(status=status.HTTP_204_NO_CONTENT)


class PokerReactionView(APIView):
    """Manda uma reação para outra pessoa da sala."""

    permission_classes = [IsAuthenticated]

    @extend_schema(request=dict, responses={201: dict})
    def post(self, request: Request, session_id: str) -> Response:
        session = _session_or_404(session_id, str(request.user.id))
        if not session:
            return Response({"error": "Sessão não encontrada"}, status=404)

        emote = request.data.get("emote")
        emoji = request.data.get("emoji")
        # Catálogo fechado nos dois casos: aceitar string livre deixaria a sala
        # virar um canal de texto arbitrário renderizado na tela de todo mundo.
        if emote is not None:
            if emote not in PokerReactionModel.EMOTES:
                return Response({"error": "Emote inválido"}, status=400)
        elif emoji not in PokerReactionModel.EMOJIS:
            return Response({"error": "Reação inválida"}, status=400)

        to_user_id = request.data.get("to_user_id")
        sender_id = str(request.user.id)
        in_room = PokerParticipantModel.objects.filter(session_id=session_id)
        if not in_room.filter(user_id=sender_id).exists():
            return Response({"error": "Você não está nesta sala"}, status=403)
        # Emote é sobre si mesmo: não tem destinatário para validar.
        if emote is None and not in_room.filter(user_id=to_user_id).exists():
            return Response({"error": "Destinatário não está na sala"}, status=400)

        reaction = PokerReactionModel.objects.create(
            session_id=session_id,
            from_user_id=sender_id,
            to_user_id=None if emote is not None else to_user_id,
            emoji="" if emote is not None else emoji,
            emote=emote or "",
        )
        PokerReactionModel.objects.filter(
            session_id=session_id, created_at__lt=timezone.now() - REACTION_TTL
        ).delete()
        return Response(_reaction_dict(reaction), status=status.HTTP_201_CREATED)


class PokerHeartbeatView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={204: None})
    def post(self, request: Request, session_id: str) -> Response:
        session = _session_or_404(session_id, str(request.user.id))
        if not session:
            return Response({"error": "Sessão não encontrada"}, status=404)
        _participant_repo.touch(session_id, str(request.user.id))
        return Response(status=status.HTTP_204_NO_CONTENT)


class PokerVoteView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=dict, responses={200: dict})
    def post(self, request: Request, session_id: str) -> Response:
        session = _session_or_404(session_id, str(request.user.id))
        if not session or not session.current_card_id:
            return Response({"error": "Nenhum card em votação"}, status=400)
        if session.status not in (SessionStatus.VOTING,):
            return Response({"error": "Votação não está aberta"}, status=400)

        # Senta quem ainda não estava sentado. O acesso ao workspace já foi
        # checado acima, e sem isto um POST de voto antes de o `join` do
        # cliente terminar estourava DoesNotExist no repositório → 500.
        _participant_repo.join(
            PokerParticipant(
                id=None,
                session_id=session_id,
                user_id=str(request.user.id),
                user_name=request.user.full_name,
                avatar_initials=_initials(request.user.full_name),
                is_host=session.created_by == str(request.user.id),
            )
        )

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
            valid = set(str(c) for c in _exclude_completed_cards(
                CardModel.objects.filter(project_id=project_id, id__in=requested_ids),
                workspace_id=str(project.workspace_id),
            ).exclude(type="epic").values_list("id", flat=True))
            card_ids = [str(c) for c in requested_ids if str(c) in valid]
        else:
            card_ids = [
                str(c) for c in _exclude_completed_cards(CardModel.objects.filter(
                    project_id=project_id, points__isnull=True
                ), workspace_id=str(project.workspace_id))
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
        session = _session_or_404(session_id, str(request.user.id))
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
        return Response(read_services.workspace_summary(workspace_id))


class PokerRoundListView(APIView):
    """Histórico de rodadas já decididas de uma sessão — o que foi votado,
    por quem, e a pontuação final aplicada em cada card."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: dict})
    def get(self, request: Request, session_id: str) -> Response:
        rounds = PokerRoundModel.objects.filter(session_id=session_id).select_related("decided_by")
        return Response([_round_dict(r) for r in rounds])


class PokerCardsView(APIView):
    """Cards que o host pode colocar na fila da sessão.

    Varre TODOS os projetos do workspace, não só um: a sessão é da squad e a
    mesma reunião estima vários produtos. Só o que ainda não tem pontos —
    numa sessão de estimativa ninguém repontua o que já foi estimado.

    `?q=` filtra por título, referência OU projeto (chave/nome) — com 2400
    cards espalhados em 33 projetos, buscar "pit" pra achar tudo do PitStopRH
    é o caminho principal, não só o título do card. `?project=` restringe a
    um projeto específico.
    """
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: dict})
    def get(self, request: Request, session_id: str) -> Response:
        session = _session_repo.get(session_id)
        if not session:
            return Response({"error": "Sessão não encontrada"}, status=404)

        cards = _exclude_completed_cards(
            CardModel.objects.filter(
                project__workspace_id=session.workspace_id, points__isnull=True
            ), workspace_id=session.workspace_id
        ).exclude(type="epic").select_related("project")
        projeto = request.query_params.get("project")
        if projeto:
            cards = cards.filter(project_id=projeto)
        busca = (request.query_params.get("q") or "").strip()
        if busca:
            cards = cards.filter(
                Q(title__icontains=busca)
                | Q(number__icontains=busca)
                | Q(project__key__icontains=busca)
                | Q(project__name__icontains=busca)
            )
        # Já escolhidos continuam visíveis: o host precisa enxergar a fila que
        # montou mesmo depois de eles saírem do filtro de "sem pontos".
        cards = cards.order_by("project__key", "rank", "number")[:200]
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


# ── Squads ────────────────────────────────────────────────────────────────────


def _squad_dict(squad: SquadModel) -> dict:
    return {
        "id": str(squad.id),
        "workspace_id": str(squad.workspace_id),
        "name": squad.name,
        "color": squad.color,
        "members": [
            {
                "user_id": str(m.user_id),
                "name": m.user.full_name or m.user.email,
                "initials": _initials(m.user.full_name or m.user.email),
            }
            for m in squad.members.select_related("user")
        ],
    }


class SquadListCreateView(APIView):
    """GET/POST /api/workspaces/<id>/squads/ — times que estimam juntos."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: dict})
    def get(self, request: Request, workspace_id: str) -> Response:
        squads = SquadModel.objects.filter(workspace_id=workspace_id).prefetch_related(
            "members__user"
        )
        return Response([_squad_dict(s) for s in squads])

    @extend_schema(request=dict, responses={201: dict})
    def post(self, request: Request, workspace_id: str) -> Response:
        name = (request.data.get("name") or "").strip()
        if not name:
            return Response({"error": "Nome obrigatório"}, status=400)
        if SquadModel.objects.filter(workspace_id=workspace_id, name__iexact=name).exists():
            return Response({"error": "Já existe uma squad com esse nome."}, status=400)

        squad = SquadModel.objects.create(
            workspace_id=workspace_id,
            name=name,
            color=request.data.get("color") or "#6366f1",
        )
        for user_id in request.data.get("member_ids") or []:
            SquadMemberModel.objects.get_or_create(squad=squad, user_id=user_id)
        return Response(_squad_dict(squad), status=status.HTTP_201_CREATED)


class SquadDetailView(APIView):
    """PATCH/DELETE /api/squads/<id>/ — renomear, trocar cor e membros."""

    permission_classes = [IsAuthenticated]

    @extend_schema(request=dict, responses={200: dict})
    def patch(self, request: Request, squad_id: str) -> Response:
        squad = SquadModel.objects.filter(id=squad_id).first()
        if not squad:
            return Response({"error": "Squad não encontrada"}, status=404)

        if "name" in request.data:
            nome = (request.data.get("name") or "").strip()
            if not nome:
                return Response({"error": "Nome obrigatório"}, status=400)
            squad.name = nome
        if "color" in request.data:
            squad.color = request.data["color"]
        squad.save()

        # Lista de membros é substituída inteira: é como a tela edita (marca e
        # desmarca), e diferenciar adição de remoção aqui não traria nada.
        if "member_ids" in request.data:
            desejados = {str(u) for u in (request.data.get("member_ids") or [])}
            atuais = {str(m.user_id) for m in squad.members.all()}
            SquadMemberModel.objects.filter(
                squad=squad, user_id__in=atuais - desejados
            ).delete()
            for user_id in desejados - atuais:
                SquadMemberModel.objects.get_or_create(squad=squad, user_id=user_id)

        squad.refresh_from_db()
        return Response(_squad_dict(squad))

    def delete(self, request: Request, squad_id: str) -> Response:
        # As sessões que já aconteceram continuam existindo (squad vira nulo):
        # apagar histórico de estimativa junto com o time seria perda de dado.
        SquadModel.objects.filter(id=squad_id).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
