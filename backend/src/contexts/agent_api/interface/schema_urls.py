"""URLconf só para gerar o openapi.json com o prefixo completo das rotas."""
from django.urls import include, path

urlpatterns = [path("api/agentes/v1/", include("contexts.agent_api.interface.urls"))]
