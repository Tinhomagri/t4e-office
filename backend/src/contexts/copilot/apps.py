"""Configuração do app copilot."""
from django.apps import AppConfig


class CopilotConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "contexts.copilot"
    label = "copilot"
    verbose_name = "Copiloto IA"
