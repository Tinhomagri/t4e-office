"""Configuração do app chatwoot."""
from django.apps import AppConfig


class ChatwootConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "contexts.chatwoot"
    label = "chatwoot"
    verbose_name = "Atendimento (Chatwoot)"
