"""Configuração do app google."""
from django.apps import AppConfig


class GoogleConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "contexts.google"
    label = "google"
    verbose_name = "Integração Google"
