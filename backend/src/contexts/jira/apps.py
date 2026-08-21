"""Configuração do app jira."""
from django.apps import AppConfig


class JiraConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "contexts.jira"
    label = "jira"
    verbose_name = "Importador Jira"

    def ready(self) -> None:
        # Sem urls.py (é só importador via management command), nada mais no
        # projeto importa este módulo — sem isto o Django "esquece" o model e
        # o makemigrations propunha apagar a tabela `jira_import_link`.
        from contexts.jira.infrastructure.django import models  # noqa: F401
