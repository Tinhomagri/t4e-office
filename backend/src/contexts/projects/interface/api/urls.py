"""Rotas do contexto projects."""
from django.urls import path

from contexts.projects.interface.api.views import ProjectListCreateView

urlpatterns = [
    path("projects/", ProjectListCreateView.as_view(), name="project-list-create"),
]
