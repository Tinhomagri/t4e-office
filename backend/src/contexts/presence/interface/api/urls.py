from django.urls import path

from contexts.presence.interface.api.views import (
    ActiveCardNoteView,
    ActiveCardView,
    AssignDeskView,
    AvatarView,
    DeskAssignmentsView,
    HeartbeatView,
    RoomView,
    StatusView,
)

urlpatterns = [
    path("heartbeat/", HeartbeatView.as_view(), name="presence-heartbeat"),
    path("room/", RoomView.as_view(), name="presence-room"),
    path("status/", StatusView.as_view(), name="presence-status"),
    path("avatar/", AvatarView.as_view(), name="presence-avatar"),
    path("desks/", DeskAssignmentsView.as_view(), name="presence-desks"),
    path("desks/assign/", AssignDeskView.as_view(), name="presence-desks-assign"),
    path("active-card/", ActiveCardView.as_view(), name="presence-active-card"),
    path(
        "active-card/note/",
        ActiveCardNoteView.as_view(),
        name="presence-active-card-note",
    ),
]
