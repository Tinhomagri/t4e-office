"""Configuração do app jira."""
from django.apps import AppConfig


class JiraConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "contexts.jira"
    label = "jira"
    verbose_name = "Importador Jira"
