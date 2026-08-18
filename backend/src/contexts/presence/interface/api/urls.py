from django.urls import path

from contexts.presence.interface.api.views import (
    ActiveCardNoteView,
    ActiveCardView,
    AssignDeskView,
    AvatarBatchView,
    AvatarView,
    DeliveryChampionView,
    DeskAssignmentsView,
    HeartbeatView,
    RoomView,
    StatusView,
)

urlpatterns = [
    path("heartbeat/", HeartbeatView.as_view(), name="presence-heartbeat"),
    path("room/", RoomView.as_view(), name="presence-room"),
    path("delivery-champion/", DeliveryChampionView.as_view(), name="presence-delivery-champion"),
    path("status/", StatusView.as_view(), name="presence-status"),
    path("avatar/", AvatarView.as_view(), name="presence-avatar"),
    path("avatars/", AvatarBatchView.as_view(), name="presence-avatars-batch"),
    path("desks/", DeskAssignmentsView.as_view(), name="presence-desks"),
    path("desks/assign/", AssignDeskView.as_view(), name="presence-desks-assign"),
    path("active-card/", ActiveCardView.as_view(), name="presence-active-card"),
    path(
        "active-card/note/",
        ActiveCardNoteView.as_view(),
        name="presence-active-card-note",
    ),
]
