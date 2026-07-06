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


class CopilotEventModel(models.Model):
    """Evento de uso do Copiloto por workspace — base de métricas e avaliação.

    `kind` classifica a interação; `rating` só é preenchido em eventos de
    feedback (👍 = 1, 👎 = -1). `count` guarda quantidades (ex.: cards criados).
    """

    KIND_CHOICES = [
        ("chat", "Mensagem no chat"),
        ("analyze", "Documento analisado"),
        ("cards", "Cards criados pela IA"),
        ("agent_execute", "Ações do agente executadas"),
        ("rating", "Avaliação da resposta"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        "identity.WorkspaceModel", on_delete=models.CASCADE, related_name="copilot_events"
    )
    actor = models.ForeignKey(
        "identity.UserModel", on_delete=models.SET_NULL, null=True, blank=True
    )
    kind = models.CharField(max_length=20, choices=KIND_CHOICES)
    rating = models.SmallIntegerField(null=True, blank=True)  # 1 / -1
    count = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "copilot_event"
        verbose_name = "Evento do Copiloto"
        verbose_name_plural = "Eventos do Copiloto"
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["workspace", "kind", "created_at"])]

    def __str__(self) -> str:
        return f"{self.kind} @ {self.workspace_id}"


class WorkspaceAiConfigModel(models.Model):
    """Configuração de IA por workspace (provedor + chave cifrada — BYO key)."""

    PROVIDER_CHOICES = [
        ("anthropic", "Anthropic (Claude)"),
        ("openai", "OpenAI"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.OneToOneField(
        "identity.WorkspaceModel", on_delete=models.CASCADE, related_name="ai_config"
    )
    provider = models.CharField(max_length=20, choices=PROVIDER_CHOICES, default="anthropic")
    model = models.CharField(max_length=80, blank=True, default="")
    # Chave cifrada com Fernet — nunca exposta em texto puro pela API.
    api_key_encrypted = models.TextField(blank=True, default="")
    is_active = models.BooleanField(default=True)
    updated_by = models.ForeignKey(
        "identity.UserModel", on_delete=models.SET_NULL, null=True, blank=True
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "copilot_ai_config"
        verbose_name = "Configuração de IA"
        verbose_name_plural = "Configurações de IA"

    def __str__(self) -> str:
        return f"{self.provider} @ {self.workspace_id}"
