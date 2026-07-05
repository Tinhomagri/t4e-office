import uuid

from django.db import models
from django.utils import timezone


class PokerSessionModel(models.Model):
    STATUS_CHOICES = [
        ("waiting", "Aguardando"),
        ("voting", "Votando"),
        ("revealed", "Revelado"),
        ("done", "Concluído"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        "identity.WorkspaceModel",
        on_delete=models.CASCADE,
        related_name="poker_sessions",
    )
    project = models.ForeignKey(
        "projects.ProjectModel",
        on_delete=models.CASCADE,
        related_name="poker_sessions",
    )
    created_by = models.ForeignKey(
        "identity.UserModel",
        on_delete=models.CASCADE,
        related_name="created_poker_sessions",
    )
    name = models.CharField(max_length=200)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="waiting")
    current_card_id = models.UUIDField(null=True, blank=True)
    card_ids = models.JSONField(default=list)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "estimation_poker_session"
        ordering = ["-created_at"]


class PokerParticipantModel(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(
        PokerSessionModel, on_delete=models.CASCADE, related_name="participants"
    )
    user = models.ForeignKey(
        "identity.UserModel",
        on_delete=models.CASCADE,
        related_name="poker_participations",
    )
    joined_at = models.DateTimeField(auto_now_add=True)
    last_seen = models.DateTimeField(default=timezone.now)
    is_host = models.BooleanField(default=False)

    class Meta:
        db_table = "estimation_poker_participant"
        unique_together = [("session", "user")]


class PokerRoundModel(models.Model):
    """Resultado de uma rodada já decidida (card retirado da fila) — snapshot
    dos votos e da pontuação final, preservado mesmo depois que os votos
    "ao vivo" (PokerVoteModel) são limpos para a próxima rodada. É essa
    tabela que alimenta o histórico/resumo do que foi votado numa sessão."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(
        PokerSessionModel, on_delete=models.CASCADE, related_name="rounds"
    )
    card_id = models.UUIDField()
    card_ref = models.CharField(max_length=20, blank=True, default="")
    card_title = models.CharField(max_length=200, blank=True, default="")
    final_points = models.PositiveSmallIntegerField()
    votes = models.JSONField(default=list)  # [{participant_name, value}, ...]
    decided_by = models.ForeignKey(
        "identity.UserModel",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="decided_poker_rounds",
    )
    decided_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "estimation_poker_round"
        ordering = ["decided_at"]


class PokerVoteModel(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(
        PokerSessionModel, on_delete=models.CASCADE, related_name="votes"
    )
    card_id = models.UUIDField()
    participant = models.ForeignKey(
        PokerParticipantModel, on_delete=models.CASCADE, related_name="votes"
    )
    value = models.CharField(max_length=10, null=True, blank=True)

    class Meta:
        db_table = "estimation_poker_vote"
        unique_together = [("session", "card_id", "participant")]
