"""Configuração do app projects."""
from django.apps import AppConfig


class ProjectsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "contexts.projects"
    label = "projects"
    verbose_name = "Projetos"
