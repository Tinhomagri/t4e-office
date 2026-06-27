"""Models Django do contexto projects."""
import uuid

from django.db import models


class ProjectModel(models.Model):
    """Projeto pertencente a um workspace."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # FK por id para o workspace do contexto identity (acoplamento por id, não por import de domínio)
    workspace = models.ForeignKey(
        "identity.WorkspaceModel", on_delete=models.CASCADE, related_name="projects"
    )
    name = models.CharField(max_length=120, help_text="Nome do projeto")
    key = models.CharField(max_length=10, help_text="Prefixo curto do ID dos cards (ex: MIA)")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "projects_project"
        verbose_name = "Projeto"
        verbose_name_plural = "Projetos"
        ordering = ["name"]
        constraints = [
            # Chave única por workspace
            models.UniqueConstraint(
                fields=["workspace", "key"], name="unique_workspace_project_key"
            )
        ]

    def __str__(self) -> str:
        return f"{self.key} — {self.name}"


class SprintModel(models.Model):
    """Sprint (ciclo de trabalho) pertencente a um projeto."""

    STATUS_CHOICES = [
        ("planned", "Planejada"),
        ("active", "Ativa"),
        ("closed", "Encerrada"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(
        ProjectModel, on_delete=models.CASCADE, related_name="sprints"
    )
    name = models.CharField(max_length=120)
    goal = models.TextField(blank=True, default="")
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="planned")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "projects_sprint"
        verbose_name = "Sprint"
        verbose_name_plural = "Sprints"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.project.key} · {self.name}"


class CardModel(models.Model):
    """Card (tarefa) pertencente a um projeto."""

    STATUS_CHOICES = [
        ("backlog", "Backlog"),
        ("todo", "A fazer"),
        ("doing", "Em andamento"),
        ("review", "Em revisão"),
        ("done", "Concluído"),
    ]
    TYPE_CHOICES = [
        ("feature", "Feature"),
        ("bug", "Bug"),
        ("debt", "Débito técnico"),
        ("spike", "Spike"),
        ("chore", "Tarefa"),
    ]
    PRIORITY_CHOICES = [
        ("low", "Baixa"),
        ("medium", "Média"),
        ("high", "Alta"),
        ("urgent", "Urgente"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(
        ProjectModel, on_delete=models.CASCADE, related_name="cards"
    )
    number = models.PositiveIntegerField(help_text="Número sequencial no projeto (ex.: 142)")
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True, default="")
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="todo")
    type = models.CharField(max_length=10, choices=TYPE_CHOICES, default="feature")
    priority = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default="medium")
    points = models.PositiveSmallIntegerField(null=True, blank=True)
    # Responsável: FK por id ao usuário do contexto identity
    assignee = models.ForeignKey(
        "identity.UserModel",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_cards",
    )
    # Sprint do card; null = card no backlog do projeto
    sprint = models.ForeignKey(
        SprintModel,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="cards",
    )
    order = models.IntegerField(default=0, help_text="Ordem dentro da coluna")
    # Procedência: marca cards criados pela IA do copiloto (Fase 2)
    source = models.CharField(max_length=20, default="manual")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "projects_card"
        verbose_name = "Card"
        verbose_name_plural = "Cards"
        ordering = ["status", "order", "number"]
        constraints = [
            models.UniqueConstraint(
                fields=["project", "number"], name="unique_project_card_number"
            )
        ]

    def __str__(self) -> str:
        return f"{self.project.key}-{self.number} {self.title}"
