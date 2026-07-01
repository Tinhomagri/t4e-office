"""Models Django do contexto copilot."""
import uuid

from django.db import models


class DocumentModel(models.Model):
    """Documento importado para análise pela IA."""

    KIND_CHOICES = [
        ("text", "Texto"),
        ("pdf", "PDF"),
        ("docx", "DOCX"),
        ("audio", "Áudio"),
    ]
    STATUS_CHOICES = [
        ("uploaded", "Importado"),
        ("analyzed", "Analisado"),
        ("failed", "Falhou"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        "identity.WorkspaceModel", on_delete=models.CASCADE, related_name="documents"
    )
    title = models.CharField(max_length=200)
    kind = models.CharField(max_length=10, choices=KIND_CHOICES, default="text")
    text = models.TextField(help_text="Texto extraído do documento")
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="uploaded")
    # Resultado da análise (resumo, tarefas, decisões, riscos)
    analysis = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "copilot_document"
        verbose_name = "Documento"
        verbose_name_plural = "Documentos"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.title
