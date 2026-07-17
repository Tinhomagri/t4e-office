from django.urls import path

from contexts.presence.interface.api.views import (
    AvatarView,
    HeartbeatView,
    RoomView,
    StatusView,
)

urlpatterns = [
    path("heartbeat/", HeartbeatView.as_view(), name="presence-heartbeat"),
    path("room/", RoomView.as_view(), name="presence-room"),
    path("status/", StatusView.as_view(), name="presence-status"),
    path("avatar/", AvatarView.as_view(), name="presence-avatar"),
]
