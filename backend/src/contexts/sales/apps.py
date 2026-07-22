"""Configuração do app sales."""
from django.apps import AppConfig


class SalesConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "contexts.sales"
    label = "sales"
    verbose_name = "Comercial"
