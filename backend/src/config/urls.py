"""Rotas raiz do projeto."""
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

urlpatterns = [
    path("admin/", admin.site.urls),
    # Schema OpenAPI (fonte dos tipos do frontend)
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path(
        "api/docs/",
        SpectacularSwaggerView.as_view(url_name="schema"),
        name="swagger-ui",
    ),
    # Contextos
    path("api/auth/", include("contexts.identity.interface.api.urls")),
    path("api/", include("contexts.projects.interface.api.urls")),
    path("api/office/", include("contexts.office.interface.api.urls")),
]
