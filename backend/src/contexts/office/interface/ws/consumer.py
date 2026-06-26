"""OfficeConsumer — WebSocket consumer para o escritório 2D."""
import json
from datetime import datetime, timezone

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from rest_framework_simplejwt.tokens import AccessToken, TokenError

from contexts.identity.infrastructure.django.models import UserModel
from contexts.office.infrastructure.django.models import (
    AvatarProfileModel,
    DeskCardModel,
    DeskModel,
    DeskSessionModel,
)

OFFICE_GROUP = "office"

# Estado em memória (por processo). Para múltiplos workers use Redis diretamente.
_presence: dict[str, dict] = {}


class OfficeConsumer(AsyncWebsocketConsumer):
    """WebSocket consumer para o escritório 2D com presença, movimento e cards."""

    async def connect(self):
        token_str = self.scope["query_string"].decode()
        token_str = dict(
            p.split("=") for p in token_str.split("&") if "=" in p
        ).get("token", "")

        try:
            token = AccessToken(token_str)
            user_id = str(token["user_id"])
            self.user = await database_sync_to_async(UserModel.objects.get)(id=user_id)
        except (TokenError, UserModel.DoesNotExist, Exception):
            await self.close(code=4001)
            return

        self.user_id = str(self.user.id)
        await self.channel_layer.group_add(OFFICE_GROUP, self.channel_name)
        await self.accept()

        profile = await self._get_or_create_profile()
        _presence[self.user_id] = {
            "user_id": self.user_id,
            "name": self.user.full_name,
            "skin": profile.skin,
            "cloth": profile.cloth,
            "hair": profile.hair,
            "accessory": profile.accessory,
            "x": 330,  # spawn: tile 10×33, 33×34 × 32px
            "y": 1120,
            "dir": "up",
            "desk_id": None,
        }

        await self.send(text_data=json.dumps({
            "type": "state_sync",
            "users": list(_presence.values()),
        }))

        await self.channel_layer.group_send(OFFICE_GROUP, {
            "type": "ws.user_join",
            "user": _presence[self.user_id],
        })

    async def disconnect(self, code):
        if not hasattr(self, "user_id"):
            return
        await self._release_desk()
        _presence.pop(self.user_id, None)
        await self.channel_layer.group_send(OFFICE_GROUP, {
            "type": "ws.user_leave",
            "user_id": self.user_id,
        })
        await self.channel_layer.group_discard(OFFICE_GROUP, self.channel_name)

    async def receive(self, text_data=None, bytes_data=None):
        if not text_data:
            return
        try:
            data = json.loads(text_data)
        except json.JSONDecodeError:
            return

        event_type = data.get("type")
        if event_type == "move":
            await self._handle_move(data)
        elif event_type == "sit":
            await self._handle_sit(data)
        elif event_type == "stand":
            await self._handle_stand()
        elif event_type == "card_update":
            await self._handle_card_update(data)

    # ── handlers ──────────────────────────────────────────────────

    async def _handle_move(self, data):
        if self.user_id not in _presence:
            return
        _presence[self.user_id].update({
            "x": data.get("x", 0),
            "y": data.get("y", 0),
            "dir": data.get("dir", "down"),
        })
        await self.channel_layer.group_send(OFFICE_GROUP, {
            "type": "ws.move",
            "user_id": self.user_id,
            "x": data.get("x", 0),
            "y": data.get("y", 0),
            "dir": data.get("dir", "down"),
        })

    async def _handle_sit(self, data):
        desk_id = data.get("desk_id")
        if not desk_id:
            return
        ok = await self._try_sit(desk_id)
        if not ok:
            return
        _presence[self.user_id]["desk_id"] = desk_id
        await self.channel_layer.group_send(OFFICE_GROUP, {
            "type": "ws.sit",
            "user_id": self.user_id,
            "desk_id": desk_id,
        })

    async def _handle_stand(self):
        await self._release_desk()
        if self.user_id in _presence:
            _presence[self.user_id]["desk_id"] = None
        await self.channel_layer.group_send(OFFICE_GROUP, {
            "type": "ws.stand",
            "user_id": self.user_id,
        })

    async def _handle_card_update(self, data):
        desk_id = _presence.get(self.user_id, {}).get("desk_id")
        if not desk_id:
            return
        await self._update_card(data)
        await self.channel_layer.group_send(OFFICE_GROUP, {
            "type": "ws.card_update",
            "user_id": self.user_id,
            "desk_id": desk_id,
            "title": data.get("title", ""),
            "status": data.get("status", "in_progress"),
            "eta": data.get("eta", ""),
        })

    # ── group send handlers (recebem do channel layer) ─────────────

    async def ws_user_join(self, event):
        await self.send(text_data=json.dumps({"type": "user_join", "user": event["user"]}))

    async def ws_user_leave(self, event):
        await self.send(text_data=json.dumps({"type": "user_leave", "user_id": event["user_id"]}))

    async def ws_move(self, event):
        await self.send(text_data=json.dumps({
            "type": "move",
            "user_id": event["user_id"],
            "x": event["x"],
            "y": event["y"],
            "dir": event["dir"],
        }))

    async def ws_sit(self, event):
        await self.send(text_data=json.dumps({
            "type": "sit",
            "user_id": event["user_id"],
            "desk_id": event["desk_id"],
        }))

    async def ws_stand(self, event):
        await self.send(text_data=json.dumps({"type": "stand", "user_id": event["user_id"]}))

    async def ws_card_update(self, event):
        await self.send(text_data=json.dumps({
            "type": "card_update",
            "user_id": event["user_id"],
            "desk_id": event["desk_id"],
            "title": event["title"],
            "status": event["status"],
            "eta": event["eta"],
        }))

    # ── helpers de DB ──────────────────────────────────────────────

    @database_sync_to_async
    def _get_or_create_profile(self):
        profile, _ = AvatarProfileModel.objects.get_or_create(user=self.user)
        return profile

    @database_sync_to_async
    def _try_sit(self, desk_id: str) -> bool:
        try:
            desk = DeskModel.objects.get(id=desk_id)
        except DeskModel.DoesNotExist:
            return False

        if desk.is_fixed and desk.owner and str(desk.owner.id) != self.user_id:
            return False

        active = DeskSessionModel.objects.filter(desk=desk, ended_at__isnull=True).exists()
        if active:
            return False

        # Encerrar sessão anterior do usuário
        DeskSessionModel.objects.filter(user=self.user, ended_at__isnull=True).update(
            ended_at=datetime.now(timezone.utc)
        )
        session = DeskSessionModel.objects.create(desk=desk, user=self.user)
        DeskCardModel.objects.create(desk_session=session)
        return True

    @database_sync_to_async
    def _release_desk(self):
        DeskSessionModel.objects.filter(user_id=self.user_id, ended_at__isnull=True).update(
            ended_at=datetime.now(timezone.utc)
        )

    @database_sync_to_async
    def _update_card(self, data: dict):
        session = (
            DeskSessionModel.objects.filter(user_id=self.user_id, ended_at__isnull=True)
            .select_related("card")
            .first()
        )
        if not session:
            return
        card, _ = DeskCardModel.objects.get_or_create(desk_session=session)
        card.title = data.get("title", card.title)
        card.status = data.get("status", card.status)
        card.eta = data.get("eta", card.eta)
        card.save(update_fields=["title", "status", "eta", "updated_at"])
