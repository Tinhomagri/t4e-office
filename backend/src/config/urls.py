"""Rotas raiz do projeto."""
from django.conf import settings
from django.contrib import admin
from django.urls import include, path, re_path
from django.views.decorators.cache import cache_control
from django.views.static import serve
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from contexts.identity.interface.api.urls import oauth_urlpatterns

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
    # Conector MCP (claude.ai Connectors): contrato exige "/api/oauth/...",
    # sem o prefixo "auth/" do resto do contexto identity — ver
    # contexts/identity/interface/api/urls.py (oauth_urlpatterns).
    path("api/", include(oauth_urlpatterns)),
    path("api/", include("contexts.projects.interface.api.urls")),
    path("api/copilot/", include("contexts.copilot.interface.api.urls")),
    path("api/", include("contexts.estimation.interface.api.urls")),
    path("api/google/", include("contexts.google.interface.api.urls")),
    path("api/github/", include("contexts.github.interface.api.urls")),
    path("api/presence/", include("contexts.presence.interface.api.urls")),
    path("api/integrations/", include("contexts.integrations.interface.api.urls")),
    path("api/traffic/", include("contexts.traffic.interface.api.urls")),
    path("api/sales/", include("contexts.sales.interface.api.urls")),
    path("api/chatwoot/", include("contexts.chatwoot.interface.api.urls")),
    path("api/meetings/", include("contexts.meetings.interface.api.urls")),
]

# Hostinger roda processo único com disco persistente: o próprio Django
# entrega os uploads, também em produção. Cache de 1 dia pro navegador não
# ficar rebaixando o mesmo anexo do disco a cada abertura.
urlpatterns += [
    re_path(
        rf"^{settings.MEDIA_URL.lstrip('/')}(?P<path>.*)$",
        cache_control(max_age=86400)(serve),
        {"document_root": settings.MEDIA_ROOT},
    ),
]
