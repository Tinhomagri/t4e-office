"""
Notificações em tempo real via SSE.

SSE endpoint: GET /api/notifications/stream/
  → StreamingHttpResponse que polling DB a cada 3s e envia eventos novos.

REST:
  GET  /api/notifications/          → lista as 50 mais recentes
  POST /api/notifications/read-all/ → marca todas como lidas
  PATCH /api/notifications/<id>/    → marca uma como lida
"""
from __future__ import annotations

import json
import time
from datetime import UTC, datetime

from django.http import StreamingHttpResponse
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.renderers import BaseRenderer
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from contexts.projects.infrastructure.django.models import NotificationModel


class EventStreamRenderer(BaseRenderer):
    """Renderer passthrough para SSE — evita 406 na negociação de conteúdo do DRF
    quando o EventSource envia Accept: text/event-stream."""

    media_type = "text/event-stream"
    format = "event-stream"

    def render(self, data, accepted_media_type=None, renderer_context=None):
        if isinstance(data, (bytes, str)):
            return data
        # Caminho de erro (ex.: 401) entrega um dict — serializa em JSON.
        import json

        return json.dumps(data)


# ── helper ───────────────────────────────────────────────────────────────────

def notify(user_id: str, notif_type: str, title: str, body: str = "", link: str = "") -> None:
    """Cria uma notificação para o usuário. Fire-and-forget."""
    NotificationModel.objects.create(
        user_id=user_id,
        type=notif_type,
        title=title,
        body=body,
        link=link,
    )


def _ser(n: NotificationModel) -> dict:
    return {
        "id": str(n.id),
        "type": n.type,
        "title": n.title,
        "body": n.body,
        "link": n.link,
        "read": n.read,
        "created_at": n.created_at.isoformat(),
    }


# ── SSE stream ───────────────────────────────────────────────────────────────

def _sse_event(data: dict) -> str:
    return f"data: {json.dumps(data)}\n\n"


def _stream_notifications(user_id: str):
    """Generator: polls DB for new notifications and yields SSE events."""
    last_seen: datetime = datetime.now(tz=UTC)

    # Send a heartbeat immediately to confirm connection
    yield ": heartbeat\n\n"

    poll_interval = 3  # seconds
    max_duration = 55  # seconds — client reconnects; avoids proxy timeouts

    start = time.monotonic()
    while time.monotonic() - start < max_duration:
        new_qs = NotificationModel.objects.filter(
            user_id=user_id,
            created_at__gt=last_seen,
        ).order_by("created_at")

        for n in new_qs:
            yield _sse_event(_ser(n))
            last_seen = n.created_at

        # Heartbeat to keep connection alive
        yield ": ping\n\n"
        time.sleep(poll_interval)


class NotificationStreamView(APIView):
    """
    GET /api/notifications/stream/ — SSE endpoint.

    Autenticação SOMENTE via header ``Authorization: Bearer <jwt>`` (DRF
    JWTAuthentication). O antigo fallback ``?token=`` foi removido: expunha o
    JWT na URL (vazava nos logs de acesso) e clientes EventSource legados
    geravam tempestade de reconexões. O frontend usa fetch-streaming com header.
    """

    permission_classes = [IsAuthenticated]
    renderer_classes = [EventStreamRenderer]  # aceita text/event-stream (evita 406)

    def get(self, request: Request) -> StreamingHttpResponse:
        user_id = str(request.user.id)
        response = StreamingHttpResponse(
            _stream_notifications(user_id),
            content_type="text/event-stream",
        )
        response["Cache-Control"] = "no-cache"
        response["X-Accel-Buffering"] = "no"
        return response


# ── REST ─────────────────────────────────────────────────────────────────────

class NotificationListView(APIView):
    """GET /api/notifications/ — 50 mais recentes do usuário."""

    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        qs = NotificationModel.objects.filter(user_id=str(request.user.id))[:50]
        return Response([_ser(n) for n in qs])


class NotificationReadAllView(APIView):
    """POST /api/notifications/read-all/ — marca todas como lidas."""

    permission_classes = [IsAuthenticated]

    def post(self, request: Request) -> Response:
        count = NotificationModel.objects.filter(
            user_id=str(request.user.id), read=False
        ).update(read=True)
        return Response({"marked_read": count})


class NotificationDetailView(APIView):
    """PATCH /api/notifications/<id>/ — marca uma como lida."""

    permission_classes = [IsAuthenticated]

    def patch(self, request: Request, notification_id: str) -> Response:
        try:
            n = NotificationModel.objects.get(id=notification_id, user_id=str(request.user.id))
        except NotificationModel.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        n.read = True
        n.save(update_fields=["read"])
        return Response(_ser(n))
