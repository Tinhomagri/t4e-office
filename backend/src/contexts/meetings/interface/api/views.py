"""Views das reuniões nativas.

Regra que organiza tudo aqui: o SFU é burro de propósito. Ele só sabe rotear
mídia para quem chega com um token válido. Toda decisão de acesso — é membro
do workspace? pode publicar? — é tomada nestas views, e vira claim no token.
"""
from datetime import timedelta

from django.conf import settings
from django.core.exceptions import ValidationError
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from contexts.estimation.infrastructure.django.models import PokerSessionModel
from contexts.meetings.infrastructure.django.models import (
    MeetingParticipantModel,
    MeetingRoomModel,
)
from contexts.meetings.infrastructure.livekit_token import issue_token
from contexts.meetings.interface.api.serializers import (
    CreateRoomSerializer,
    JoinRoomSerializer,
)
from contexts.projects.infrastructure.django.repositories_impl import (
    DjangoWorkspaceAccess,
)
from shared.domain.errors import NotFoundError, PermissionDeniedError

_WEEKDAY_PT = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"]


def _uid(request: Request) -> str:
    return str(request.user.id)


def _assert_member(workspace_id: str, user_id: str) -> None:
    if not DjangoWorkspaceAccess().is_member(
        workspace_id=str(workspace_id), user_id=user_id
    ):
        raise PermissionDeniedError("Você não tem acesso a este workspace.")


def _history_of(room: MeetingRoomModel) -> list[dict]:
    """Quem passou pela sala e por quanto tempo."""
    rows = room.participants.select_related("user").order_by("joined_at")
    out = []
    for p in rows:
        end = p.left_at or room.closed_at
        minutes = int((end - p.joined_at).total_seconds() // 60) if end else 0
        out.append({
            "user_id": str(p.user_id),
            "name": p.user.full_name or p.user.email,
            "joined_at": p.joined_at.isoformat(),
            "minutes": max(minutes, 0),
        })
    return out


def _room_dict(
    room: MeetingRoomModel, *, live: int = 0, participants: list[dict] | None = None
) -> dict:
    return {
        "id": str(room.id),
        "slug": room.slug,
        "name": room.name,
        "project_id": str(room.project_id) if room.project_id else None,
        "card_id": str(room.card_id) if room.card_id else None,
        "created_by": str(room.created_by),
        "created_at": room.created_at.isoformat(),
        "closed_at": room.closed_at.isoformat() if room.closed_at else None,
        "participants": live,
        # Só no histórico: quem participou e por quanto tempo. Na listagem de
        # salas abertas seria uma query por linha sem ninguém olhar.
        "history": participants or [],
        # Duração total da reunião, do primeiro registro ao encerramento.
        "duration_minutes": (
            int((room.closed_at - room.created_at).total_seconds() // 60)
            if room.closed_at
            else 0
        ),
    }


class RoomListCreateView(APIView):
    """GET/POST /api/meetings/rooms/ — salas abertas do workspace."""

    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        workspace_id = request.query_params.get("workspace_id", "")
        _assert_member(workspace_id, _uid(request))
        # ?closed=1 devolve o histórico. Mesma rota porque o payload é o mesmo
        # — muda só o recorte e, no histórico, a lista de quem participou.
        closed = request.query_params.get("closed") in ("1", "true")
        if closed:
            rooms = MeetingRoomModel.objects.filter(
                workspace_id=workspace_id, closed_at__isnull=False
            )[:50]
            return Response([_room_dict(r, participants=_history_of(r)) for r in rooms])

        rooms = MeetingRoomModel.objects.filter(
            workspace_id=workspace_id, closed_at__isnull=True
        )
        # Presentes = participação aberta. Uma query só para todas as salas,
        # senão a listagem viraria N+1 com uma sala por linha.
        live: dict[str, int] = {}
        rows = MeetingParticipantModel.objects.filter(
            room__workspace_id=workspace_id, left_at__isnull=True
        ).values_list("room_id", flat=True)
        for room_id in rows:
            live[str(room_id)] = live.get(str(room_id), 0) + 1

        return Response(
            [_room_dict(r, live=live.get(str(r.id), 0)) for r in rooms]
        )

    def post(self, request: Request) -> Response:
        serializer = CreateRoomSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        v = serializer.validated_data
        workspace_id = str(v["workspace_id"])
        _assert_member(workspace_id, _uid(request))

        room = MeetingRoomModel(
            workspace_id=workspace_id,
            name=v["name"],
            project_id=v.get("project_id") or None,
            card_id=v.get("card_id") or None,
            created_by=_uid(request),
        )
        # O slug precisa existir antes de salvar (é unique e não-nulo) e vem do
        # id justamente para não colidir entre workspaces.
        room.slug = f"ws-{workspace_id[:8]}-{room.id.hex[:12]}"
        room.save()
        return Response(_room_dict(room), status=status.HTTP_201_CREATED)


class RoomJoinView(APIView):
    """POST /api/meetings/rooms/<room_id>/join/ — devolve o token de entrada."""

    permission_classes = [IsAuthenticated]

    def post(self, request: Request, room_id: str) -> Response:
        serializer = JoinRoomSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        room = MeetingRoomModel.objects.filter(id=room_id).first()
        if room is None or room.closed_at is not None:
            raise NotFoundError("Sala não encontrada ou já encerrada.")
        uid = _uid(request)
        _assert_member(str(room.workspace_id), uid)

        token = issue_token(
            room=room.slug,
            identity=uid,
            name=request.user.full_name or request.user.email,
            can_publish=serializer.validated_data["publish"],
        )
        # Reentrada (refresh, queda de rede) reaproveita a participação aberta
        # em vez de inflar a contagem de presentes com fantasmas.
        MeetingParticipantModel.objects.get_or_create(
            room=room, user_id=uid, left_at=None
        )
        return Response(
            {"token": token, "url": settings.LIVEKIT_URL, "room": _room_dict(room)}
        )


class OfficeRoomJoinView(APIView):
    """Entrada na sala persistente de mídia de um andar do Escritório."""
    permission_classes = [IsAuthenticated]

    def post(self, request: Request) -> Response:
        workspace_id = str(request.data.get("workspace_id", ""))
        floor = max(1, min(8, int(request.data.get("floor", 1))))
        _assert_member(workspace_id, _uid(request))
        slug = f"office-{workspace_id[:8]}-floor-{floor}"
        room, _ = MeetingRoomModel.objects.get_or_create(
            slug=slug,
            defaults={"workspace_id": workspace_id, "name": f"Escritório · andar {floor}", "created_by": _uid(request)},
        )
        MeetingParticipantModel.objects.get_or_create(room=room, user_id=_uid(request), left_at=None)
        return Response({"token": issue_token(room=slug, identity=_uid(request), name=request.user.full_name or request.user.email), "url": settings.LIVEKIT_URL, "room": _room_dict(room)})


class PokerRoomJoinView(APIView):
    """Entrada na sala de mídia de uma sessão de Planning Poker.

    A sala segue a sessão (um slug por sessão), então quem abre a mesma URL
    do poker cai no mesmo áudio/vídeo — sem passar pelo Escritório.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request: Request) -> Response:
        session_id = str(request.data.get("session_id", ""))
        try:
            poker = PokerSessionModel.objects.get(id=session_id)
        except (PokerSessionModel.DoesNotExist, ValidationError, ValueError) as exc:
            raise NotFoundError("Sessão de Planning Poker não encontrada.") from exc
        workspace_id = str(poker.workspace_id)
        _assert_member(workspace_id, _uid(request))
        slug = f"poker-{session_id}"
        room, _ = MeetingRoomModel.objects.get_or_create(
            slug=slug,
            defaults={
                "workspace_id": workspace_id,
                "name": f"Planning Poker · {poker.name}",
                "created_by": _uid(request),
            },
        )
        MeetingParticipantModel.objects.get_or_create(
            room=room, user_id=_uid(request), left_at=None
        )
        return Response(
            {
                "token": issue_token(
                    room=slug,
                    identity=_uid(request),
                    name=request.user.full_name or request.user.email,
                ),
                "url": settings.LIVEKIT_URL,
                "room": _room_dict(room),
            }
        )


class RoomLeaveView(APIView):
    """POST /api/meetings/rooms/<room_id>/leave/ — fecha a participação."""

    permission_classes = [IsAuthenticated]

    def post(self, request: Request, room_id: str) -> Response:
        MeetingParticipantModel.objects.filter(
            room_id=room_id, user_id=_uid(request), left_at=None
        ).update(left_at=timezone.now())
        return Response({"ok": True})


class RoomCloseView(APIView):
    """POST /api/meetings/rooms/<room_id>/close/ — encerra a sala."""

    permission_classes = [IsAuthenticated]

    def post(self, request: Request, room_id: str) -> Response:
        room = MeetingRoomModel.objects.filter(id=room_id).first()
        if room is None:
            raise NotFoundError("Sala não encontrada.")
        _assert_member(str(room.workspace_id), _uid(request))
        room.closed_at = timezone.now()
        room.save(update_fields=["closed_at"])
        MeetingParticipantModel.objects.filter(room=room, left_at=None).update(
            left_at=timezone.now()
        )
        return Response(_room_dict(room))


def _minutes(joined_at, left_at, closed_at, now) -> int:
    end = left_at or closed_at or now
    return max(0, int((end - joined_at).total_seconds() // 60))


class MeetingReportView(APIView):
    """GET /api/meetings/report/?workspace_id=X&days=30

    Quantas reuniões, quanto tempo e com quem — do usuário que pediu, dentro
    do workspace. Participação aberta (sem `left_at`, sala ainda ao vivo) conta
    até agora, não fica de fora do total.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        workspace_id = request.query_params.get("workspace_id", "")
        uid = _uid(request)
        _assert_member(workspace_id, uid)

        days = int(request.query_params.get("days", 30))
        now = timezone.now()
        since = now - timedelta(days=days)

        mine = list(
            MeetingParticipantModel.objects.filter(
                room__workspace_id=workspace_id, user_id=uid, joined_at__gte=since
            ).select_related("room")
        )

        room_ids = {str(p.room_id) for p in mine}
        total_meetings = len(room_ids)
        weekday_minutes = [0] * 7
        total_minutes = 0
        for p in mine:
            mins = _minutes(p.joined_at, p.left_at, p.room.closed_at, now)
            total_minutes += mins
            weekday_minutes[p.joined_at.weekday()] += mins

        busiest_idx = max(range(7), key=lambda i: weekday_minutes[i]) if total_minutes else None

        # Colaboradores: quem mais dividiu sala com o usuário no período —
        # mesma pergunta que o relatório do Google Meet responde do lado de lá.
        collab_minutes: dict[str, int] = {}
        collab_meetings: dict[str, int] = {}
        collab_names: dict[str, str] = {}
        if room_ids:
            others = MeetingParticipantModel.objects.filter(
                room_id__in=room_ids, joined_at__gte=since
            ).exclude(user_id=uid).select_related("user", "room")
            seen_rooms_by_user: dict[str, set[str]] = {}
            for p in others:
                key = str(p.user_id)
                collab_names[key] = p.user.full_name or p.user.email
                collab_minutes[key] = collab_minutes.get(key, 0) + _minutes(
                    p.joined_at, p.left_at, p.room.closed_at, now
                )
                seen_rooms_by_user.setdefault(key, set()).add(str(p.room_id))
            collab_meetings = {k: len(v) for k, v in seen_rooms_by_user.items()}

        top_collaborators = sorted(
            (
                {"user_id": k, "name": collab_names[k], "meetings": collab_meetings[k], "minutes": v}
                for k, v in collab_minutes.items()
            ),
            key=lambda c: c["minutes"],
            reverse=True,
        )[:10]

        return Response({
            "total_meetings": total_meetings,
            "total_minutes": total_minutes,
            "average_minutes": round(total_minutes / total_meetings, 1) if total_meetings else 0.0,
            "busiest_weekday": _WEEKDAY_PT[busiest_idx] if busiest_idx is not None else None,
            "top_collaborators": top_collaborators,
        })
