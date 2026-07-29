"""Views da API de Presença (Escritório Virtual — MVP)."""
from __future__ import annotations

from datetime import UTC, datetime, timedelta

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from contexts.identity.infrastructure.django.models import MembershipModel
from contexts.presence.domain.status_resolver import VALID_STATUSES, resolve_status
from contexts.presence.infrastructure.django.models import (
    PresenceModel,
    UserAvatarModel,
)
from contexts.presence.application.assign_desk import assign_desk, list_desk_assignments
from contexts.presence.infrastructure.meeting import refresh_busy_until
from contexts.projects.interface.api.permissions import _assert_workspace
from shared.domain.errors import PermissionDeniedError

# Janela de frescor: presenças mais antigas que isto não estão "na sala".
FRESH_WINDOW = timedelta(seconds=30)


def _assert_member(workspace_id: str, user_id: str) -> None:
    if not MembershipModel.objects.filter(
        workspace_id=workspace_id, user_id=user_id
    ).exists():
        raise PermissionDeniedError("Você não tem acesso a este workspace.")


def _clamp01(value) -> float:
    try:
        v = float(value)
    except (TypeError, ValueError):
        return 0.5
    return max(0.0, min(1.0, v))


MAX_FLOOR = 8


def _clamp_floor(value: object) -> int:
    """Andar válido; qualquer lixo cai no primeiro andar."""
    try:
        n = int(value)
    except (TypeError, ValueError):
        return 1
    return n if 1 <= n <= MAX_FLOOR else 1


class HeartbeatView(APIView):
    """POST /api/presence/heartbeat/ — atualiza posição e mantém presença viva."""

    permission_classes = [IsAuthenticated]

    def post(self, request: Request) -> Response:
        workspace_id = str(request.data.get("workspace_id", ""))
        if not workspace_id:
            return Response({"error": "workspace_id obrigatório"}, status=400)
        user_id = str(request.user.id)
        _assert_member(workspace_id, user_id)

        now = datetime.now(UTC)
        x = _clamp01(request.data.get("x", 0.5))
        y = _clamp01(request.data.get("y", 0.5))
        facing = str(request.data.get("facing", "down"))
        if facing not in {"down", "up", "left", "right"}:
            facing = "down"
        floor = _clamp_floor(request.data.get("floor", 1))

        presence, _ = PresenceModel.objects.get_or_create(
            workspace_id=workspace_id, user_id=user_id
        )
        moved = presence.last_moved is None or presence.x != x or presence.y != y
        presence.x = x
        presence.y = y
        presence.facing = facing
        presence.floor = floor
        presence.last_seen = now
        if moved:
            presence.last_moved = now

        # Reunião via Google Agenda (best-effort, com throttle interno).
        refresh_busy_until(presence, now=now)
        presence.save()

        return Response({"status": _effective(presence, now)})


class RoomView(APIView):
    """GET /api/presence/room/?workspace_id= — quem está na sala agora."""

    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        workspace_id = str(request.query_params.get("workspace_id", ""))
        if not workspace_id:
            return Response({"error": "workspace_id obrigatório"}, status=400)
        _assert_member(workspace_id, str(request.user.id))

        now = datetime.now(UTC)
        cutoff = now - FRESH_WINDOW
        floor = _clamp_floor(request.query_params.get("floor", 1))
        rows = (
            PresenceModel.objects.filter(
                workspace_id=workspace_id, last_seen__gte=cutoff, floor=floor
            )
            .select_related("user")
        )

        avatars = {
            str(a.user_id): a.config
            for a in UserAvatarModel.objects.filter(
                user_id__in=[r.user_id for r in rows]
            )
        }

        data = [
            {
                "user_id": str(r.user_id),
                "name": r.user.full_name,
                "x": r.x,
                "y": r.y,
                "facing": r.facing,
                "floor": r.floor,
                "status": _effective(r, now),
                "avatar_config": avatars.get(str(r.user_id)),
            }
            for r in rows
        ]
        return Response(data)


class StatusView(APIView):
    """PUT /api/presence/status/ — fixa (ou limpa) override manual de status."""

    permission_classes = [IsAuthenticated]

    def put(self, request: Request) -> Response:
        workspace_id = str(request.data.get("workspace_id", ""))
        if not workspace_id:
            return Response({"error": "workspace_id obrigatório"}, status=400)
        user_id = str(request.user.id)
        _assert_member(workspace_id, user_id)

        raw = request.data.get("status")
        new_status = None if raw in (None, "", "auto") else str(raw)
        if new_status is not None and new_status not in VALID_STATUSES:
            return Response({"error": f"status inválido: {new_status}"}, status=400)

        now = datetime.now(UTC)
        presence, _ = PresenceModel.objects.get_or_create(
            workspace_id=workspace_id, user_id=user_id
        )
        presence.manual_status = new_status
        presence.manual_status_at = now if new_status else None
        presence.last_seen = now
        presence.save(update_fields=["manual_status", "manual_status_at", "last_seen"])

        return Response({"status": _effective(presence, now)})


class AvatarView(APIView):
    """GET/PUT /api/presence/avatar/ — avatar persistido do usuário."""

    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        avatar = UserAvatarModel.objects.filter(user_id=request.user.id).first()
        return Response({"config": avatar.config if avatar else None})

    def put(self, request: Request) -> Response:
        config = request.data.get("config")
        if not isinstance(config, dict):
            return Response({"error": "config deve ser um objeto"}, status=400)
        avatar, _ = UserAvatarModel.objects.update_or_create(
            user_id=request.user.id, defaults={"config": config}
        )
        return Response({"config": avatar.config}, status=status.HTTP_200_OK)


def _effective(presence: PresenceModel, now: datetime) -> str:
    return resolve_status(
        now=now,
        last_moved=presence.last_moved,
        manual_status=presence.manual_status,
        manual_status_at=presence.manual_status_at,
        busy_until=presence.busy_until,
    )


def _serialize_desk_assignments(rows) -> list[dict]:
    return [
        {
            "seat_id": r.seat_id,
            "floor": r.floor,
            "user_id": str(r.user_id),
            "user_name": r.user.full_name,
        }
        for r in rows
    ]


class DeskAssignmentsView(APIView):
    """GET /api/presence/desks/?workspace_id=&floor= — qualquer membro lê."""

    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        workspace_id = str(request.query_params.get("workspace_id", ""))
        if not workspace_id:
            return Response({"error": "workspace_id obrigatório"}, status=400)
        _assert_workspace(workspace_id, str(request.user.id), min_role="member")
        floor = _clamp_floor(request.query_params.get("floor", 1))
        rows = list_desk_assignments(workspace_id=workspace_id, floor=floor)
        return Response(_serialize_desk_assignments(rows))


class AssignDeskView(APIView):
    """POST /api/presence/desks/assign/ — só owner/admin do workspace."""

    permission_classes = [IsAuthenticated]

    def post(self, request: Request) -> Response:
        workspace_id = str(request.data.get("workspace_id", ""))
        seat_id = str(request.data.get("seat_id", ""))
        if not workspace_id or not seat_id:
            return Response({"error": "workspace_id e seat_id obrigatórios"}, status=400)
        _assert_workspace(workspace_id, str(request.user.id), min_role="admin")

        floor = _clamp_floor(request.data.get("floor", 1))
        raw_user_id = request.data.get("user_id")
        user_id = str(raw_user_id) if raw_user_id else None

        assign_desk(
            workspace_id=workspace_id, floor=floor, seat_id=seat_id, user_id=user_id
        )
        rows = list_desk_assignments(workspace_id=workspace_id, floor=floor)
        return Response(_serialize_desk_assignments(rows))
