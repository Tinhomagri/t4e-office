"""Rotas do contexto google."""
from django.urls import path

from contexts.google.interface.api.views import (
    AvailabilityView,
    GoogleAuthUrlView,
    GoogleCallbackView,
    GoogleDisconnectView,
    GoogleStatusView,
    MeetingCreateView,
    UpcomingEventsView,
)

urlpatterns = [
    path("auth-url/", GoogleAuthUrlView.as_view(), name="google-auth-url"),
    path("callback/", GoogleCallbackView.as_view(), name="google-callback"),
    path("status/", GoogleStatusView.as_view(), name="google-status"),
    path("disconnect/", GoogleDisconnectView.as_view(), name="google-disconnect"),
    path("availability/", AvailabilityView.as_view(), name="google-availability"),
    path("meetings/", MeetingCreateView.as_view(), name="google-meetings"),
    path("events/upcoming/", UpcomingEventsView.as_view(), name="google-events-upcoming"),
]
