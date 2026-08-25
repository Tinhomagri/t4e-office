"""Rotas do contexto integrations — /api/integrations/."""
from django.urls import path

from contexts.integrations.interface.api.insight_views import (
    AccountsHealthView,
    AnalyticsTimeseriesView,
    QueueStatsView,
)
from contexts.integrations.interface.api.drive_config_views import (
    DriveConfigTestView,
    DriveConfigView,
)
from contexts.integrations.interface.api.drive_library_views import (
    DriveDaysView,
    DriveFileContentView,
    DrivePublicFileView,
    DrivePublicUrlView,
    DriveProjectsView,
    DriveTakesView,
    DriveUploadSessionView,
)
from contexts.integrations.interface.api.oauth_views import (
    OAuthCallbackView,
    OAuthCredentialsView,
    OAuthProvidersView,
    OAuthUrlView,
)
from contexts.integrations.interface.api.views import (
    AnalyticsView,
    PostDetailView,
    PostPublishView,
    PostsView,
)

urlpatterns = [
    path("drive/config/", DriveConfigView.as_view(), name="integrations-drive-config"),
    path("drive/config/test/", DriveConfigTestView.as_view(), name="integrations-drive-config-test"),
    path("drive/takes/", DriveTakesView.as_view(), name="integrations-drive-takes"),
    path("drive/takes/<str:file_id>/", DriveTakesView.as_view(), name="integrations-drive-take-trash"),
    path("drive/days/", DriveDaysView.as_view(), name="integrations-drive-days"),
    path("drive/projects/", DriveProjectsView.as_view(), name="integrations-drive-projects"),
    path("drive/uploads/<str:library>/", DriveUploadSessionView.as_view(), name="integrations-drive-upload-session"),
    path("drive/files/<str:file_id>/public-url/", DrivePublicUrlView.as_view(), name="integrations-drive-public-url"),
    path("drive/files/<str:file_id>/<str:mode>/", DriveFileContentView.as_view(), name="integrations-drive-file-content"),
    path("drive/public/<str:file_id>/", DrivePublicFileView.as_view(), name="integrations-drive-public-file"),
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
]
