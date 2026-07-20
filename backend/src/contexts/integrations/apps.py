"""Configuração do app integrations."""
from django.apps import AppConfig


class IntegrationsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "contexts.integrations"
    label = "integrations"
    verbose_name = "Integrações externas"
