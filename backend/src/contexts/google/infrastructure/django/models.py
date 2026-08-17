"""Models Django do contexto google — camada de infraestrutura."""
import uuid
from datetime import timedelta

from django.conf import settings
from django.db import models
from django.utils import timezone


class GoogleConnectionModel(models.Model):
    """Conexão OAuth Google de um usuário (tokens cifrados)."""

    STATUS_CHOICES = [("active", "Ativa"), ("revoked", "Revogada")]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="google_connection",
    )
    google_email = models.EmailField(blank=True)
    # Tokens cifrados (Fernet) — nunca em texto plano no banco.
    refresh_token = models.TextField()
    access_token = models.TextField(blank=True)
    expiry = models.DateTimeField()
    scopes = models.JSONField(default=list)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="active")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "google_connection"
        verbose_name = "Conexão Google"
        verbose_name_plural = "Conexões Google"

    def __str__(self) -> str:
        return f"{self.google_email} ({self.status})"


class OAuthStateModel(models.Model):
    """State OAuth temporário p/ proteção CSRF (TTL curto)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    state = models.CharField(max_length=128, unique=True, db_index=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="google_oauth_states",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()

    class Meta:
        db_table = "google_oauth_state"

    def __str__(self) -> str:
        return f"state {self.state[:8]}… (user {self.user_id})"

    def save(self, *args, **kwargs):
        if not self.expires_at:
            self.expires_at = timezone.now() + timedelta(minutes=10)
        super().save(*args, **kwargs)

    @property
    def is_expired(self) -> bool:
        return timezone.now() > self.expires_at


class MeetingRefModel(models.Model):
    """Referência leve a um evento criado pelo app (Google é fonte da verdade)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="google_meetings",
    )
    google_event_id = models.CharField(max_length=256, db_index=True)
    card_id = models.UUIDField(null=True, blank=True)
    # Projeto vinculado: quando presente, a transcrição da reunião (que o Meet
    # solta no Drive só depois, sem hora certa) vira Documento deste projeto —
    # ver management command `check_meeting_transcripts`.
    project = models.ForeignKey(
        "projects.ProjectModel",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="google_meetings",
    )
    # Guardados na criação pra o polling não precisar voltar no Calendar só
    # pra saber o nome do evento e a janela de busca no Drive.
    title = models.CharField(max_length=300, blank=True, default="")
    meeting_end = models.DateTimeField(null=True, blank=True)
    # Preenchido quando a transcrição já foi achada e virou Documento — sem
    # isto o polling ficaria procurando pra sempre, toda vez que rodasse.
    transcript_saved_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "google_meeting_ref"

    def __str__(self) -> str:
        return self.google_event_id
