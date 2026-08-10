"""Consultas administrativas do contexto de projetos."""
from django.contrib import admin

from contexts.projects.infrastructure.django.models import AnonymousReportModel


@admin.register(AnonymousReportModel)
class AnonymousReportAdmin(admin.ModelAdmin):
    """Caixa de entrada somente para leitura das denúncias anônimas."""

    list_display = ("category", "description")
    list_filter = ("category",)
    search_fields = ("description",)
    readonly_fields = ("category", "description")
    fields = ("category", "description")

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return request.method in ("GET", "HEAD")

    def has_delete_permission(self, request, obj=None):
        return False
