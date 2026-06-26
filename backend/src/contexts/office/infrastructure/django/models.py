"""Models Django do contexto office."""
import uuid

from django.conf import settings
from django.db import models


class AvatarProfileModel(models.Model):
    """Configuração visual do avatar do usuário."""

    SKIN_CHOICES = [(i, str(i)) for i in range(5)]
    CLOTH_CHOICES = [(i, str(i)) for i in range(6)]
    HAIR_CHOICES = [(i, str(i)) for i in range(4)]
    ACCESSORY_CHOICES = [(i, str(i)) for i in range(3)]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="avatar_profile"
    )
    skin = models.SmallIntegerField(choices=SKIN_CHOICES, default=0)
    cloth = models.SmallIntegerField(choices=CLOTH_CHOICES, default=0)
    hair = models.SmallIntegerField(choices=HAIR_CHOICES, default=0)
    accessory = models.SmallIntegerField(choices=ACCESSORY_CHOICES, default=0)
    configured = models.BooleanField(default=False)

    class Meta:
        db_table = "office_avatar_profile"
        verbose_name = "Perfil de Avatar"

    def __str__(self) -> str:
        return f"Avatar de {self.user}"


class DeskModel(models.Model):
    """Mesa física do escritório."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    label = models.CharField(max_length=40)
    group_number = models.SmallIntegerField()
    position_in_group = models.SmallIntegerField()
    tile_x = models.SmallIntegerField()
    tile_y = models.SmallIntegerField()
    is_fixed = models.BooleanField(default=False)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="fixed_desk",
    )

    class Meta:
        db_table = "office_desk"
        verbose_name = "Mesa"
        ordering = ["group_number", "position_in_group"]

    def __str__(self) -> str:
        return self.label


class DeskSessionModel(models.Model):
    """Sessão de ocupação de uma mesa."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    desk = models.ForeignKey(DeskModel, on_delete=models.CASCADE, related_name="sessions")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="desk_sessions"
    )
    started_at = models.DateTimeField(auto_now_add=True)
    ended_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "office_desk_session"
        verbose_name = "Sessão de Mesa"

    def is_active(self) -> bool:
        return self.ended_at is None


class DeskCardModel(models.Model):
    """Card de status vinculado a uma sessão de mesa."""

    STATUS_CHOICES = [
        ("in_progress", "Em progresso"),
        ("reviewing", "Em revisão"),
        ("blocked", "Bloqueado"),
        ("meeting", "Reunião"),
        ("afk", "Ausente"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    desk_session = models.OneToOneField(
        DeskSessionModel, on_delete=models.CASCADE, related_name="card"
    )
    title = models.CharField(max_length=200, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="in_progress")
    eta = models.CharField(max_length=60, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "office_desk_card"
        verbose_name = "Card de Desk"

    def __str__(self) -> str:
        return f"{self.status}: {self.title[:40]}"
