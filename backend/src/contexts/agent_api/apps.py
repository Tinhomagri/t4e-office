"""Configuração do app agent_api (API de leitura para os agentes de IA)."""
from django.apps import AppConfig


class AgentApiConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "contexts.agent_api"
    label = "agent_api"
    verbose_name = "API de agentes"
