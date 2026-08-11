"""Rotas raiz do projeto."""
from django.conf import settings
from django.conf.urls.static import static
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
    path("api/copilot/", include("contexts.copilot.interface.api.urls")),
    path("api/", include("contexts.estimation.interface.api.urls")),
    path("api/google/", include("contexts.google.interface.api.urls")),
    path("api/github/", include("contexts.github.interface.api.urls")),
    path("api/presence/", include("contexts.presence.interface.api.urls")),
    path("api/integrations/", include("contexts.integrations.interface.api.urls")),
    path("api/sales/", include("contexts.sales.interface.api.urls")),
    path("api/chatwoot/", include("contexts.chatwoot.interface.api.urls")),
    path("api/meetings/", include("contexts.meetings.interface.api.urls")),
]

# Em dev o próprio runserver entrega os uploads. Em produção quem serve é o
# proxy/CDN na frente, então esta rota não entra.
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
