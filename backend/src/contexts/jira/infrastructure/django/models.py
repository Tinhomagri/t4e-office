"""Models Django do contexto jira (importador de backfill).

Só guarda a ponte entre issue do Jira e card do T4E Office — não replicamos
schema em `contexts.projects` (mesmo princípio do `contexts.github`).
"""
import uuid

from django.db import models


class JiraImportLinkModel(models.Model):
    """Qual card do T4E Office veio de qual issue do Jira.

    Chave de idempotência: `jira_issue_id` (o id numérico do Jira é estável
    mesmo se a issue for movida entre projetos ou renumerada — `jira_key`
    pode mudar, `jira_issue_id` não).
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(
        "projects.ProjectModel", on_delete=models.CASCADE, related_name="jira_links"
    )
    card = models.OneToOneField(
        "projects.CardModel", on_delete=models.CASCADE, related_name="jira_link"
    )
    jira_issue_id = models.CharField(max_length=32)
    jira_key = models.CharField(max_length=32)
    imported_at = models.DateTimeField(auto_now_add=True)
    last_synced_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "jira_import_link"
        verbose_name = "Vínculo de importação Jira"
        verbose_name_plural = "Vínculos de importação Jira"
        constraints = [
            models.UniqueConstraint(
                fields=["project", "jira_issue_id"], name="uniq_jira_project_issue"
            )
        ]

    def __str__(self) -> str:
        return f"{self.jira_key} → card {self.card_id}"
