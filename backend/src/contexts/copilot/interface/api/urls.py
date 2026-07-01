"""Rotas do contexto copilot."""
from django.urls import path

from contexts.copilot.interface.api.views import (
    DocumentAnalyzeView,
    DocumentCreateTasksView,
    DocumentListCreateView,
)

urlpatterns = [
    path("documents/", DocumentListCreateView.as_view(), name="document-list-create"),
    path(
        "documents/<uuid:document_id>/analyze/",
        DocumentAnalyzeView.as_view(),
        name="document-analyze",
    ),
    path(
        "documents/<uuid:document_id>/create-tasks/",
        DocumentCreateTasksView.as_view(),
        name="document-create-tasks",
    ),
]
