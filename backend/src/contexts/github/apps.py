"""Configuração do app github."""
from django.apps import AppConfig


class GithubConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "contexts.github"
    label = "github"
    verbose_name = "Integração GitHub"
