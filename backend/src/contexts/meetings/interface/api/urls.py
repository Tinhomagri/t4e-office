"""Rotas das reuniões nativas."""
from django.urls import path

from contexts.meetings.interface.api.views import (
    MeetingReportView,
    OfficeRoomJoinView,
    PokerRoomJoinView,
    RoomCloseView,
    RoomEndCallView,
    RoomJoinView,
    RoomLeaveView,
    RoomListCreateView,
)

urlpatterns = [
    path("report/", MeetingReportView.as_view(), name="meeting-report"),
    path("rooms/", RoomListCreateView.as_view(), name="meeting-rooms"),
    path("rooms/<uuid:room_id>/join/", RoomJoinView.as_view(), name="meeting-join"),
    path("office/join/", OfficeRoomJoinView.as_view(), name="office-meeting-join"),
    path("poker/join/", PokerRoomJoinView.as_view(), name="poker-meeting-join"),
    path("rooms/<uuid:room_id>/leave/", RoomLeaveView.as_view(), name="meeting-leave"),
    path("rooms/<uuid:room_id>/close/", RoomCloseView.as_view(), name="meeting-close"),
    path(
        "rooms/<uuid:room_id>/end-call/",
        RoomEndCallView.as_view(),
        name="meeting-end-call",
    ),
]
