"""Rotas do contexto traffic — /api/traffic/."""
from django.urls import path

from contexts.traffic.interface.api.views import (
    TrafficPreviewView,
    TrafficReportView,
    TrafficThumbnailView,
)

urlpatterns = [
    path("report/<str:relatorio>/", TrafficReportView.as_view(), name="traffic-report"),
    path("thumbnail/", TrafficThumbnailView.as_view(), name="traffic-thumbnail"),
    path("preview/", TrafficPreviewView.as_view(), name="traffic-preview"),
]
