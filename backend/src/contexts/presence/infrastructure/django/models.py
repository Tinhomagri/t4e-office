"""Models do contexto de Presença (Escritório Virtual — Fase 5, MVP)."""
import uuid

from django.db import models
from django.utils import timezone


class PresenceModel(models.Model):
    """Posição e presença de um usuário numa sala de workspace.

    Uma linha por (usuário, workspace); atualizada por heartbeat.
    O status *efetivo* não é guardado — é derivado em leitura pelo
    status_resolver a partir de last_moved / manual / busy_until.
    """

    FACING_CHOICES = [("down", "down"), ("up", "up"), ("left", "left"), ("right", "right")]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        "identity.UserModel",
        on_delete=models.CASCADE,
        related_name="presences",
    )
    workspace = models.ForeignKey(
        "identity.WorkspaceModel",
        on_delete=models.CASCADE,
        related_name="presences",
    )
    x = models.FloatField(default=0.5)  # normalizado 0..1 (largura da sala)
    y = models.FloatField(default=0.5)  # normalizado 0..1 (altura da sala)
    facing = models.CharField(max_length=8, choices=FACING_CHOICES, default="down")

    # Em que andar a pessoa está. Sem isto, os avatares de todos os andares se
    # acumulam sobre a planta de quem está olhando.
    floor = models.PositiveSmallIntegerField(default=1)

    manual_status = models.CharField(max_length=16, null=True, blank=True)
    manual_status_at = models.DateTimeField(null=True, blank=True)

    # Cache best-effort do Google Agenda (evita bater na API a cada leitura).
    busy_until = models.DateTimeField(null=True, blank=True)
    meeting_checked_at = models.DateTimeField(null=True, blank=True)

    last_seen = models.DateTimeField(default=timezone.now)
    last_moved = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "presence_presence"
        unique_together = [("user", "workspace")]
        indexes = [models.Index(fields=["workspace", "last_seen"])]


class UserAvatarModel(models.Model):
    """Avatar chibi persistido do usuário — identidade visual no Escritório.

    Antes vivia só em localStorage; para o Escritório os outros precisam ver
    o seu avatar, então a config passa a ser persistida no servidor.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(
        "identity.UserModel",
        on_delete=models.CASCADE,
        related_name="avatar",
    )
    config = models.JSONField(default=dict)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "presence_user_avatar"


class DeskAssignmentModel(models.Model):
    """Quem senta em qual mesa — atribuição manual do admin, não mais hash.

    Uma mesa sem linha aqui está livre. `(workspace, user)` é único: atribuir
    mesa nova pra alguém precisa apagar a linha antiga dela antes (ver
    `contexts.presence.application.assign_desk`), senão o banco rejeita.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        "identity.WorkspaceModel",
        on_delete=models.CASCADE,
        related_name="desk_assignments",
    )
    floor = models.PositiveSmallIntegerField()
    seat_id = models.CharField(max_length=64)
    user = models.ForeignKey(
        "identity.UserModel",
        on_delete=models.CASCADE,
        related_name="desk_assignments",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "presence_desk_assignment"
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "floor", "seat_id"], name="uniq_desk_per_seat"
            ),
            models.UniqueConstraint(
                fields=["workspace", "user"], name="uniq_desk_per_user"
            ),
        ]
