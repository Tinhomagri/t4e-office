"""Rotas do contexto github."""
from django.urls import path

from contexts.github.interface.api.views import (
    CardCreateBranchView,
    CardDevLinksView,
    GithubDisconnectView,
    GithubOAuthCallbackView,
    GithubOAuthUrlView,
    GithubReposView,
    GithubStatusView,
    GithubWebhookView,
    ProjectDevMetricsView,
    ProjectRepoLinkView,
    ProjectRepoUnlinkView,
)

urlpatterns = [
    path("oauth/url/", GithubOAuthUrlView.as_view(), name="github-oauth-url"),
    path("oauth/callback/", GithubOAuthCallbackView.as_view(), name="github-oauth-callback"),
    path("status/", GithubStatusView.as_view(), name="github-status"),
    path("disconnect/", GithubDisconnectView.as_view(), name="github-disconnect"),
    path("repos/", GithubReposView.as_view(), name="github-repos"),
    path("projects/<uuid:project_id>/dev/", ProjectDevMetricsView.as_view(), name="github-project-dev"),
    path("projects/<uuid:project_id>/repos/", ProjectRepoLinkView.as_view(), name="github-project-repos"),
    path("projects/<uuid:project_id>/repos/<uuid:link_id>/", ProjectRepoUnlinkView.as_view(), name="github-project-repo-unlink"),
    path("cards/<uuid:card_id>/links/", CardDevLinksView.as_view(), name="github-card-links"),
    path("cards/<uuid:card_id>/branch/", CardCreateBranchView.as_view(), name="github-card-branch"),
    path("webhook/", GithubWebhookView.as_view(), name="github-webhook"),
]
