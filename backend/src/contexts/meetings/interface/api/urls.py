"""Rotas das reuniões nativas."""
from django.urls import path

from contexts.meetings.interface.api.views import (
    MeetingReportView,
    RoomCloseView,
    RoomJoinView,
    RoomLeaveView,
    RoomListCreateView,
)

urlpatterns = [
    path("report/", MeetingReportView.as_view(), name="meeting-report"),
    path("rooms/", RoomListCreateView.as_view(), name="meeting-rooms"),
    path("rooms/<uuid:room_id>/join/", RoomJoinView.as_view(), name="meeting-join"),
    path("rooms/<uuid:room_id>/leave/", RoomLeaveView.as_view(), name="meeting-leave"),
    path("rooms/<uuid:room_id>/close/", RoomCloseView.as_view(), name="meeting-close"),
]
