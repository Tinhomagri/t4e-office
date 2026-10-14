"""Rotas da API de agentes (montadas em /api/agentes/v1/)."""
from django.urls import path
from drf_spectacular.renderers import OpenApiJsonRenderer
from drf_spectacular.views import SpectacularAPIView
from rest_framework.permissions import AllowAny

from contexts.agent_api.interface.cards import CardDetailView, CardsView
from contexts.agent_api.interface.horas import HorasView
from contexts.agent_api.interface.views import AuditoriaView, ProjetosView, health

urlpatterns = [
    path("health/", health, name="agentes-health"),
    path(
        "openapi.json",
        SpectacularAPIView.as_view(
            urlconf="contexts.agent_api.interface.schema_urls",
            authentication_classes=[],
            permission_classes=[AllowAny],
            renderer_classes=[OpenApiJsonRenderer],
            custom_settings={
                "TITLE": "Office T4E — API de leitura para agentes",
                "VERSION": "1",
            },
        ),
        name="agentes-openapi",
    ),
    path("auditoria/", AuditoriaView.as_view(), name="agentes-auditoria"),
    path("projetos/", ProjetosView.as_view(), name="agentes-projetos"),
    path("cards/", CardsView.as_view(), name="agentes-cards"),
    path("cards/<uuid:card_id>/", CardDetailView.as_view(), name="agentes-card"),
    path("horas/", HorasView.as_view(), name="agentes-horas"),
]
