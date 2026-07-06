"""Models Django do contexto github — integração de código estilo Jira.

Três peças:
* `GithubConnectionModel` — conexão OAuth de um usuário (token cifrado). É com
  ela que agimos no GitHub (criar branch, ler PRs) em nome do usuário.
* `GithubRepoLinkModel` — vínculo de um repositório a um projeto do Pulse, com
  o webhook registrado para receber eventos (push, pull_request).
* `CardDevLinkModel` — item de "Desenvolvimento" atrelado a um card (branch,
  commit ou pull request), alimentado pelo webhook e pela criação de branch.
"""
import uuid
from datetime import timedelta

from django.conf import settings
from django.db import models
from django.utils import timezone


class GithubConnectionModel(models.Model):
    """Conexão OAuth GitHub de um usuário (token cifrado com Fernet)."""

    STATUS_CHOICES = [("active", "Ativa"), ("revoked", "Revogada")]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="github_connection",
    )
    github_login = models.CharField(max_length=100, blank=True)
    github_avatar = models.URLField(blank=True)
    access_token = models.TextField()  # cifrado
    scopes = models.JSONField(default=list)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="active")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "github_connection"
        verbose_name = "Conexão GitHub"
        verbose_name_plural = "Conexões GitHub"

    def __str__(self) -> str:
        return f"{self.github_login} ({self.status})"


class GithubOAuthStateModel(models.Model):
    """State OAuth temporário (CSRF) — guarda o contexto de retorno."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    state = models.CharField(max_length=128, unique=True, db_index=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="github_oauth_states",
    )
    return_to = models.CharField(max_length=300, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()

    class Meta:
        db_table = "github_oauth_state"

    def save(self, *args, **kwargs):
        if not self.expires_at:
            self.expires_at = timezone.now() + timedelta(minutes=10)
        super().save(*args, **kwargs)

    @property
    def is_expired(self) -> bool:
        return timezone.now() > self.expires_at


class GithubRepoLinkModel(models.Model):
    """Repositório GitHub vinculado a um projeto do Pulse."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project_id = models.UUIDField(db_index=True)
    workspace_id = models.UUIDField(db_index=True)
    full_name = models.CharField(max_length=200)  # owner/repo
    default_branch = models.CharField(max_length=100, default="main")
    webhook_id = models.BigIntegerField(null=True, blank=True)
    webhook_secret = models.CharField(max_length=128, blank=True)
    connected_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "github_repo_link"
        constraints = [
            models.UniqueConstraint(
                fields=["project_id", "full_name"], name="uniq_project_repo"
            )
        ]

    def __str__(self) -> str:
        return f"{self.full_name} → projeto {self.project_id}"


class CardDevLinkModel(models.Model):
    """Item de desenvolvimento (branch/commit/PR) ligado a um card."""

    KIND_CHOICES = [
        ("branch", "Branch"),
        ("commit", "Commit"),
        ("pull_request", "Pull Request"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    card_id = models.UUIDField(db_index=True)
    project_id = models.UUIDField(db_index=True)
    repo_full_name = models.CharField(max_length=200)
    kind = models.CharField(max_length=15, choices=KIND_CHOICES)
    external_id = models.CharField(max_length=200)  # sha, nº do PR ou nome da branch
    number = models.IntegerField(null=True, blank=True)  # nº do PR
    title = models.CharField(max_length=300, blank=True)
    url = models.URLField(blank=True)
    state = models.CharField(max_length=20, blank=True)  # open/closed/merged
    branch = models.CharField(max_length=200, blank=True)
    author_login = models.CharField(max_length=100, blank=True)
    author_avatar = models.URLField(blank=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "github_card_dev_link"
        ordering = ["-updated_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["card_id", "kind", "external_id"], name="uniq_card_dev_link"
            )
        ]

    def __str__(self) -> str:
        return f"{self.kind}:{self.external_id} → card {self.card_id}"
