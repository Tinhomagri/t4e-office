"""Rotas do contexto google."""
from django.urls import path

from contexts.google.interface.api.chat_views import (
    ChatDmCreateView,
    ChatMessageListView,
    ChatSpaceListView,
)
from contexts.google.interface.api.views import (
    AvailabilityView,
    GoogleAuthUrlView,
    GoogleCallbackView,
    GoogleDisconnectView,
    GoogleStatusView,
    MeetingCreateView,
    MeetingDetailView,
    MeetingReportView,
    UpcomingEventsView,
)

urlpatterns = [
    path("auth-url/", GoogleAuthUrlView.as_view(), name="google-auth-url"),
    path("callback/", GoogleCallbackView.as_view(), name="google-callback"),
    path("status/", GoogleStatusView.as_view(), name="google-status"),
    path("disconnect/", GoogleDisconnectView.as_view(), name="google-disconnect"),
    path("availability/", AvailabilityView.as_view(), name="google-availability"),
    path("meetings/", MeetingCreateView.as_view(), name="google-meetings"),
    path("meetings/report/", MeetingReportView.as_view(), name="google-meetings-report"),
    path("meetings/<str:event_id>/", MeetingDetailView.as_view(), name="google-meeting-detail"),
    path("events/upcoming/", UpcomingEventsView.as_view(), name="google-events-upcoming"),
    path("chat/spaces/", ChatSpaceListView.as_view(), name="google-chat-spaces"),
    path("chat/spaces/dm/", ChatDmCreateView.as_view(), name="google-chat-dm"),
    # `path:` — o nome do espaço do Chat é "spaces/AAA" (tem barra).
    path(
        "chat/spaces/<path:space_id>/messages/",
        ChatMessageListView.as_view(),
        name="google-chat-messages",
    ),
]
