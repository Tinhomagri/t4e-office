"""Models do contexto integrations — publicação social e import Jira/Trello.

Três peças:
* `ScheduledPostModel` — post agendado/publicado numa conta social conectada
  (conta vive no contexto copilot: `SocialAccountModel`). Publicação real via
  API do provider é plugada em `infrastructure/providers.py`; hoje é simulada.
* `PostMetricModel` — métricas coletadas de um post publicado.
* `ImportJobModel` — job de importação de board externo (Jira/Trello) para um
  projeto, com preview antes da execução.
"""
import uuid

from django.db import models


class SocialAppCredentialModel(models.Model):
    """Credenciais do app OAuth de um provider, por workspace.

    Configuradas pelo admin no frontend (Marketing → Redes → Configurar apps).
    O `client_secret` é cifrado (Fernet). Quando não houver registro para o
    workspace, o backend cai no `.env` (SOCIAL_<PROVIDER>_CLIENT_ID/SECRET).
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        "identity.WorkspaceModel", on_delete=models.CASCADE, related_name="social_app_credentials"
    )
    provider = models.CharField(max_length=20)
    client_id = models.CharField(max_length=255, blank=True, default="")
    client_secret_encrypted = models.TextField(blank=True, default="")
    updated_by = models.ForeignKey(
        "identity.UserModel", on_delete=models.SET_NULL, null=True, blank=True
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "integrations_social_app_credential"
        verbose_name = "Credencial de app social"
        verbose_name_plural = "Credenciais de apps sociais"
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "provider"], name="uniq_social_app_cred_ws_provider"
            )
        ]

    def __str__(self) -> str:
        return f"{self.provider} @ {self.workspace_id}"


class SocialOAuthStateModel(models.Model):
    """State OAuth temporário (CSRF + PKCE) do fluxo de conexão social."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    state = models.CharField(max_length=128, unique=True, db_index=True)
    provider = models.CharField(max_length=20)
    workspace_id = models.UUIDField()
    user = models.ForeignKey(
        "identity.UserModel", on_delete=models.CASCADE, related_name="social_oauth_states"
    )
    # PKCE (obrigatório no X): verifier gerado no início do fluxo
    code_verifier = models.CharField(max_length=200, blank=True, default="")
    return_to = models.CharField(max_length=300, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()

    class Meta:
        db_table = "integrations_social_oauth_state"
        verbose_name = "State OAuth social"
        verbose_name_plural = "States OAuth sociais"


class ScheduledPostModel(models.Model):
    """Post agendado para publicação numa rede social do workspace."""

    STATUS_CHOICES = [
        ("draft", "Rascunho"),
        ("scheduled", "Agendado"),
        ("published", "Publicado"),
        ("failed", "Falhou"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        "identity.WorkspaceModel", on_delete=models.CASCADE, related_name="scheduled_posts"
    )
    # Projeto/card de origem (acoplamento por id — post pode existir sem card)
    project = models.ForeignKey(
        "projects.ProjectModel",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="scheduled_posts",
    )
    card_id = models.UUIDField(null=True, blank=True)
    account = models.ForeignKey(
        "copilot.SocialAccountModel",
        on_delete=models.CASCADE,
        related_name="scheduled_posts",
    )
    content = models.TextField()
    media_url = models.CharField(max_length=500, blank=True, default="")
    # Carrossel/múltiplas mídias (imagens/vídeos). Se vazio, usa media_url.
    media_urls = models.JSONField(default=list, blank=True)
    # @menções a acrescentar no texto (lista de handles, sem o @).
    mentions = models.JSONField(default=list, blank=True)
    scheduled_at = models.DateTimeField()
    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default="scheduled")
    # Id retornado pelo provider após publicar
    external_id = models.CharField(max_length=120, blank=True, default="")
    error = models.TextField(blank=True, default="")
    # Fila: tentativas de publicação e próxima janela de retry (worker cron).
    attempts = models.PositiveIntegerField(default=0)
    next_attempt_at = models.DateTimeField(null=True, blank=True)
    published_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        "identity.UserModel", on_delete=models.SET_NULL, null=True, blank=True
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "integrations_scheduled_post"
        verbose_name = "Post agendado"
        verbose_name_plural = "Posts agendados"
        ordering = ["scheduled_at"]
        indexes = [
            # Query da fila: posts prontos para disparar.
            models.Index(fields=["status", "scheduled_at"], name="idx_post_status_sched"),
        ]

    def __str__(self) -> str:
        return f"{self.account.channel} @ {self.scheduled_at:%d/%m %H:%M} ({self.status})"


class PostMetricModel(models.Model):
    """Métricas de um post publicado (coleta simulada/plugável)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    post = models.OneToOneField(
        ScheduledPostModel, on_delete=models.CASCADE, related_name="metric"
    )
    impressions = models.PositiveIntegerField(default=0)
    likes = models.PositiveIntegerField(default=0)
    comments = models.PositiveIntegerField(default=0)
    shares = models.PositiveIntegerField(default=0)
    clicks = models.PositiveIntegerField(default=0)
    collected_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "integrations_post_metric"
        verbose_name = "Métrica de post"
        verbose_name_plural = "Métricas de posts"


class ImportJobModel(models.Model):
    """Importação de board externo (Jira/Trello) para um projeto."""

    PROVIDER_CHOICES = [("jira", "Jira"), ("trello", "Trello")]
    STATUS_CHOICES = [
        ("preview", "Preview"),
        ("done", "Concluída"),
        ("failed", "Falhou"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        "identity.WorkspaceModel", on_delete=models.CASCADE, related_name="import_jobs"
    )
    project = models.ForeignKey(
        "projects.ProjectModel",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="import_jobs",
    )
    provider = models.CharField(max_length=10, choices=PROVIDER_CHOICES)
    # Itens extraídos do export (lista de dicts título/status/descrição/…)
    preview = models.JSONField(default=list)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="preview")
    # Resultado da execução: {created: N, skipped: N}
    result = models.JSONField(default=dict, blank=True)
    created_by = models.ForeignKey(
        "identity.UserModel", on_delete=models.SET_NULL, null=True, blank=True
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "integrations_import_job"
        verbose_name = "Importação externa"
        verbose_name_plural = "Importações externas"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.provider} → {self.project_id} ({self.status})"
