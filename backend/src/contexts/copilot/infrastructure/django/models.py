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
    project = models.ForeignKey(
        "projects.ProjectModel",
        on_delete=models.CASCADE,
        related_name="copilot_documents",
        null=True,
        blank=True,
    )
    title = models.CharField(max_length=200)
    kind = models.CharField(max_length=10, choices=KIND_CHOICES, default="text")
    text = models.TextField(help_text="Texto extraído do documento")
    # Arquivo original (PDF/DOCX) — só existe quando o documento veio de
    # upload de arquivo; texto colado (kind="text") nunca tem file. Guardado
    # pra permitir download do bruto pela UI, além da leitura do texto via MCP.
    file = models.FileField(upload_to="copilot_documents/", null=True, blank=True)
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
        ("google", "Google (Gemini)"),
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


class WorkspaceBrandKitModel(models.Model):
    """Kit de marca por workspace: identidade + tom de voz que guia a IA."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.OneToOneField(
        "identity.WorkspaceModel", on_delete=models.CASCADE, related_name="brand_kit"
    )
    tone_of_voice = models.TextField(
        blank=True, default="", help_text="Como a marca fala (ex.: próxima, jovem, sem jargão)"
    )
    # Paleta como lista de hex (ex.: ["#E8452C", "#123456"])
    colors = models.JSONField(default=list, blank=True)
    fonts = models.CharField(max_length=200, blank=True, default="")
    logo_url = models.TextField(blank=True, default="")
    guidelines = models.TextField(
        blank=True, default="", help_text="Diretrizes livres (o que evitar, termos etc.)"
    )
    updated_by = models.ForeignKey(
        "identity.UserModel", on_delete=models.SET_NULL, null=True, blank=True
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "copilot_brand_kit"
        verbose_name = "Kit de marca"
        verbose_name_plural = "Kits de marca"

    def __str__(self) -> str:
        return f"BrandKit @ {self.workspace_id}"


class SocialAccountModel(models.Model):
    """Conta de rede social conectada a um workspace, por canal.

    Registro da conexão (handle + provider). Publicação real via API do provider
    é plugada na camada de publicação; aqui guardamos o vínculo e o estado.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        "identity.WorkspaceModel", on_delete=models.CASCADE, related_name="social_accounts"
    )
    channel = models.CharField(max_length=30, help_text="instagram, linkedin, facebook…")
    account_name = models.CharField(max_length=120, help_text="@handle ou nome da página")
    # Tokens OAuth cifrados (Fernet) obtidos no fluxo oficial de cada rede.
    access_token_encrypted = models.TextField(blank=True, default="")
    refresh_token_encrypted = models.TextField(blank=True, default="")
    token_expires_at = models.DateTimeField(null=True, blank=True)
    # Id do usuário/página no provider (ex.: page_id do Facebook, open_id TikTok)
    external_id = models.CharField(max_length=120, blank=True, default="")
    connected_by = models.ForeignKey(
        "identity.UserModel", on_delete=models.SET_NULL, null=True, blank=True
    )
    connected_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "copilot_social_account"
        verbose_name = "Conta social"
        verbose_name_plural = "Contas sociais"
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "channel"], name="unique_workspace_social_channel"
            )
        ]

    def __str__(self) -> str:
        return f"{self.channel}:{self.account_name} @ {self.workspace_id}"
