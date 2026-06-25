"""Models Django do contexto projects."""
import uuid

from django.db import models


class ProjectModel(models.Model):
    """Projeto pertencente a um workspace."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # FK por id para o workspace do contexto identity (acoplamento por id, não por import de domínio)
    workspace = models.ForeignKey(
        "identity.WorkspaceModel", on_delete=models.CASCADE, related_name="projects"
    )
    name = models.CharField(max_length=120, help_text="Nome do projeto")
    key = models.CharField(max_length=10, help_text="Prefixo curto do ID dos cards (ex: MIA)")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "projects_project"
        verbose_name = "Projeto"
        verbose_name_plural = "Projetos"
        ordering = ["name"]
        constraints = [
            # Chave única por workspace
            models.UniqueConstraint(
                fields=["workspace", "key"], name="unique_workspace_project_key"
            )
        ]

    def __str__(self) -> str:
        return f"{self.key} — {self.name}"
