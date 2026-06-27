"""Rotas do contexto projects."""
from django.urls import path

from contexts.projects.interface.api.card_views import (
    CardDetailView,
    CardListCreateView,
)
from contexts.projects.interface.api.sprint_views import (
    SprintDetailView,
    SprintListCreateView,
)
from contexts.projects.interface.api.views import ProjectListCreateView

urlpatterns = [
    path("projects/", ProjectListCreateView.as_view(), name="project-list-create"),
    path(
        "projects/<uuid:project_id>/cards/",
        CardListCreateView.as_view(),
        name="card-list-create",
    ),
    path("cards/<uuid:card_id>/", CardDetailView.as_view(), name="card-detail"),
    path(
        "projects/<uuid:project_id>/sprints/",
        SprintListCreateView.as_view(),
        name="sprint-list-create",
    ),
    path("sprints/<uuid:sprint_id>/", SprintDetailView.as_view(), name="sprint-detail"),
]
