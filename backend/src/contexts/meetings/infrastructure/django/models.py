"""Models das reuniões nativas (sala WebRTC própria, via SFU LiveKit)."""
import uuid

from django.db import models


class MeetingRoomModel(models.Model):
    """Sala de reunião do workspace.

    A sala é um registro nosso — o SFU não guarda estado entre reuniões, ele só
    roteia mídia enquanto alguém está conectado. Persistir aqui é o que permite
    listar salas, controlar quem entra e amarrar a conversa a um projeto ou card.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        "identity.WorkspaceModel",
        on_delete=models.CASCADE,
        related_name="meeting_rooms",
    )
    # Nome técnico da sala no SFU. Derivado do id para nunca colidir entre
    # workspaces — dois times podem ter uma sala "Daily" sem se cruzarem.
    slug = models.CharField(max_length=64, unique=True)
    name = models.CharField(max_length=120)
    # Reunião ancorada num projeto/card: dá contexto e permite abrir a sala
    # direto do board. Nulo = sala solta do workspace.
    project = models.ForeignKey(
        "projects.ProjectModel",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="meeting_rooms",
    )
    card = models.ForeignKey(
        "projects.CardModel",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="meeting_rooms",
    )
    created_by = models.UUIDField()
    created_at = models.DateTimeField(auto_now_add=True)
    # Encerrada: some da lista sem apagar o histórico de participação.
    closed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "meetings_room"
        ordering = ["-created_at"]
        verbose_name = "Sala de reunião"
        verbose_name_plural = "Salas de reunião"

    def __str__(self) -> str:
        return self.name


class MeetingParticipantModel(models.Model):
    """Registro de quem entrou numa sala e quando saiu.

    Serve ao histórico ("quem participou da daily de ontem") e à contagem de
    presentes na listagem, sem precisar consultar o SFU a cada request.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    room = models.ForeignKey(
        MeetingRoomModel, on_delete=models.CASCADE, related_name="participants"
    )
    user = models.ForeignKey(
        "identity.UserModel",
        on_delete=models.CASCADE,
        related_name="meeting_participations",
    )
    joined_at = models.DateTimeField(auto_now_add=True)
    left_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "meetings_participant"
        ordering = ["-joined_at"]

    def __str__(self) -> str:
        return f"{self.user_id} em {self.room_id}"
