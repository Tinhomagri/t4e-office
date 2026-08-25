"""Configuração do app traffic."""
from django.apps import AppConfig


class TrafficConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "contexts.traffic"
    label = "traffic"
    verbose_name = "Tráfego pago (Meta Ads)"
