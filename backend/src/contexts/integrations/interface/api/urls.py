"""Rotas do contexto integrations — /api/integrations/."""
from django.urls import path

from contexts.integrations.interface.api.insight_views import (
    AccountsHealthView,
    AnalyticsTimeseriesView,
    QueueStatsView,
)
from contexts.integrations.interface.api.oauth_views import (
    OAuthCallbackView,
    OAuthCredentialsView,
    OAuthProvidersView,
    OAuthUrlView,
)
from contexts.integrations.interface.api.views import (
    AnalyticsView,
    ImportExecuteView,
    ImportPreviewView,
    PostDetailView,
    PostPublishView,
    PostsView,
)

urlpatterns = [
    path("oauth/providers/", OAuthProvidersView.as_view(), name="integrations-oauth-providers"),
    path(
        "oauth/credentials/",
        OAuthCredentialsView.as_view(),
        name="integrations-oauth-credentials",
    ),
    path(
        "oauth/credentials/<str:provider>/",
        OAuthCredentialsView.as_view(),
        name="integrations-oauth-credentials-detail",
    ),
    path("oauth/<str:provider>/url/", OAuthUrlView.as_view(), name="integrations-oauth-url"),
    path(
        "oauth/<str:provider>/callback/",
        OAuthCallbackView.as_view(),
        name="integrations-oauth-callback",
    ),
    path("posts/", PostsView.as_view(), name="integrations-posts"),
    path("posts/<uuid:post_id>/", PostDetailView.as_view(), name="integrations-post-detail"),
    path(
        "posts/<uuid:post_id>/publish/",
        PostPublishView.as_view(),
        name="integrations-post-publish",
    ),
    path("analytics/", AnalyticsView.as_view(), name="integrations-analytics"),
    path(
        "analytics/timeseries/",
        AnalyticsTimeseriesView.as_view(),
        name="integrations-analytics-timeseries",
    ),
    path("queue/stats/", QueueStatsView.as_view(), name="integrations-queue-stats"),
    path(
        "accounts/health/",
        AccountsHealthView.as_view(),
        name="integrations-accounts-health",
    ),
    path("import/preview/", ImportPreviewView.as_view(), name="integrations-import-preview"),
    path("import/execute/", ImportExecuteView.as_view(), name="integrations-import-execute"),
]
