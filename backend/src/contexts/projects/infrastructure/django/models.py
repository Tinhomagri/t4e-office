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
        ("epic", "Épico"),
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
    status = models.CharField(max_length=50, default="todo")
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
    # Relator: quem abriu/pediu o card
    reporter = models.ForeignKey(
        "identity.UserModel",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reported_cards",
    )
    # Sprint do card; null = card no backlog do projeto
    sprint = models.ForeignKey(
        SprintModel,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="cards",
    )
    # Card pai (subtarefa). null = card de topo.
    parent = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="subtasks",
    )
    labels = models.JSONField(default=list, blank=True)
    start_date = models.DateField(null=True, blank=True)
    due_date = models.DateField(null=True, blank=True)
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


class IssueLinkModel(models.Model):
    """Vínculo direcional entre dois cards (source → target)."""

    LINK_CHOICES = [
        ("relates", "Relacionado a"),
        ("blocks", "Bloqueia"),
        ("duplicates", "Duplica"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    source = models.ForeignKey(
        CardModel, on_delete=models.CASCADE, related_name="links_out"
    )
    target = models.ForeignKey(
        CardModel, on_delete=models.CASCADE, related_name="links_in"
    )
    link_type = models.CharField(max_length=12, choices=LINK_CHOICES, default="relates")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "projects_issue_link"
        verbose_name = "Vínculo de card"
        verbose_name_plural = "Vínculos de card"
        constraints = [
            models.UniqueConstraint(
                fields=["source", "target", "link_type"],
                name="unique_issue_link",
            )
        ]

    def __str__(self) -> str:
        return f"{self.source_id} {self.link_type} {self.target_id}"


class CardHistoryModel(models.Model):
    """Registro de mudança de campo num card (linha do tempo de atividade)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    card = models.ForeignKey(
        CardModel, on_delete=models.CASCADE, related_name="history"
    )
    author = models.ForeignKey(
        "identity.UserModel",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="card_changes",
    )
    field = models.CharField(max_length=40)
    old_value = models.TextField(blank=True, default="")
    new_value = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "projects_card_history"
        verbose_name = "Histórico de card"
        verbose_name_plural = "Históricos de card"
        ordering = ["created_at"]

    def __str__(self) -> str:
        return f"{self.card_id} {self.field}: {self.old_value} → {self.new_value}"


class CardCommentModel(models.Model):
    """Comentário na atividade de um card."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    card = models.ForeignKey(
        CardModel, on_delete=models.CASCADE, related_name="comments"
    )
    author = models.ForeignKey(
        "identity.UserModel", on_delete=models.CASCADE, related_name="card_comments"
    )
    body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "projects_card_comment"
        verbose_name = "Comentário"
        verbose_name_plural = "Comentários"
        ordering = ["created_at"]

    def __str__(self) -> str:
        return f"comentário em {self.card_id}"


class VersionModel(models.Model):
    """Release/versão do projeto."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(ProjectModel, on_delete=models.CASCADE, related_name="versions")
    name = models.CharField(max_length=80)
    description = models.TextField(blank=True, default="")
    release_date = models.DateField(null=True, blank=True)
    released = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "projects_version"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.project.key} v{self.name}"


class ComponentModel(models.Model):
    """Componente (área funcional) do projeto."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(ProjectModel, on_delete=models.CASCADE, related_name="components")
    name = models.CharField(max_length=80)
    lead = models.ForeignKey(
        "identity.UserModel", on_delete=models.SET_NULL, null=True, blank=True, related_name="led_components"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "projects_component"
        ordering = ["name"]

    def __str__(self) -> str:
        return f"{self.project.key}/{self.name}"


class CardVersionModel(models.Model):
    """Relação M2M entre Card e Version (fix versions)."""
    card = models.ForeignKey(CardModel, on_delete=models.CASCADE, related_name="fix_versions")
    version = models.ForeignKey(VersionModel, on_delete=models.CASCADE, related_name="cards")

    class Meta:
        db_table = "projects_card_version"
        unique_together = [("card", "version")]


class CardComponentModel(models.Model):
    """Relação M2M entre Card e Component."""
    card = models.ForeignKey(CardModel, on_delete=models.CASCADE, related_name="card_components")
    component = models.ForeignKey(ComponentModel, on_delete=models.CASCADE, related_name="cards")

    class Meta:
        db_table = "projects_card_component"
        unique_together = [("card", "component")]


class WorklogModel(models.Model):
    """Registro de tempo gasto num card."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    card = models.ForeignKey(CardModel, on_delete=models.CASCADE, related_name="worklogs")
    author = models.ForeignKey(
        "identity.UserModel", on_delete=models.CASCADE, related_name="worklogs"
    )
    time_seconds = models.PositiveIntegerField(help_text="Segundos trabalhados")
    started_at = models.DateTimeField()
    comment = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "projects_worklog"
        ordering = ["-started_at"]

    def __str__(self) -> str:
        return f"{self.card_id} {self.time_seconds}s"


class AttachmentModel(models.Model):
    """Anexo (arquivo) vinculado a um card."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    card = models.ForeignKey(CardModel, on_delete=models.CASCADE, related_name="attachments")
    author = models.ForeignKey(
        "identity.UserModel", on_delete=models.CASCADE, related_name="attachments"
    )
    filename = models.CharField(max_length=255)
    file = models.FileField(upload_to="attachments/%Y/%m/")
    mime_type = models.CharField(max_length=100, blank=True, default="")
    size = models.PositiveIntegerField(default=0, help_text="Tamanho em bytes")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "projects_attachment"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.filename


class CustomFieldModel(models.Model):
    """Campo personalizado definido a nível de projeto."""
    FIELD_TYPES = [
        ("text", "Texto"), ("number", "Número"), ("date", "Data"),
        ("select", "Seleção única"), ("multiselect", "Seleção múltipla"),
        ("checkbox", "Checkbox"), ("user", "Usuário"),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(ProjectModel, on_delete=models.CASCADE, related_name="custom_fields")
    name = models.CharField(max_length=80)
    field_type = models.CharField(max_length=15, choices=FIELD_TYPES, default="text")
    options = models.JSONField(default=list, blank=True, help_text="Opções para select/multiselect")
    required = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "projects_custom_field"
        ordering = ["name"]

    def __str__(self) -> str:
        return f"{self.project.key}/{self.name}"


class IssueFieldValueModel(models.Model):
    """Valor de campo personalizado para um card."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    card = models.ForeignKey(CardModel, on_delete=models.CASCADE, related_name="field_values")
    field = models.ForeignKey(CustomFieldModel, on_delete=models.CASCADE, related_name="values")
    value_json = models.JSONField(null=True, blank=True)

    class Meta:
        db_table = "projects_issue_field_value"
        unique_together = [("card", "field")]

    def __str__(self) -> str:
        return f"{self.card_id}:{self.field_id}={self.value_json}"


class WorkflowStatusModel(models.Model):
    """Status customizável por projeto (slug é o valor armazenado em CardModel.status)."""

    CATEGORY_CHOICES = [
        ("todo", "A fazer"),
        ("in_progress", "Em andamento"),
        ("done", "Concluído"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(
        ProjectModel, on_delete=models.CASCADE, related_name="workflow_statuses"
    )
    name = models.CharField(max_length=80)
    slug = models.CharField(max_length=50)
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default="todo")
    color = models.CharField(max_length=7, default="#6b7280")
    order = models.PositiveSmallIntegerField(default=0)
    is_default = models.BooleanField(default=False)

    class Meta:
        db_table = "projects_workflow_status"
        ordering = ["order"]
        unique_together = [("project", "slug")]

    def __str__(self) -> str:
        return f"{self.project.key}/{self.slug}"


class NotificationModel(models.Model):
    """Notificação em tempo real para um usuário."""

    TYPE_CHOICES = [
        ("card_assigned", "Card atribuído"),
        ("card_commented", "Comentário adicionado"),
        ("card_status_changed", "Status alterado"),
        ("automation_ran", "Automação executada"),
        ("sprint_started", "Sprint iniciada"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user_id = models.UUIDField(db_index=True)
    type = models.CharField(max_length=40, choices=TYPE_CHOICES)
    title = models.CharField(max_length=200)
    body = models.TextField(blank=True, default="")
    link = models.CharField(max_length=300, blank=True, default="")
    read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "projects_notification"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"[{self.type}] → {self.user_id}"


class AutomationRuleModel(models.Model):
    """Regra de automação: trigger → condições → ação."""

    TRIGGER_CHOICES = [
        ("cron", "Agendado (cron)"),
        ("status_changed", "Status alterado"),
        ("card_created", "Card criado"),
    ]
    ACTION_CHOICES = [
        ("change_status", "Alterar status"),
        ("assign_user", "Atribuir usuário"),
        ("add_label", "Adicionar label"),
        ("remove_label", "Remover label"),
        ("set_priority", "Alterar prioridade"),
    ]
    SCHEDULE_CHOICES = [
        ("daily_morning", "Diário às 9h"),
        ("daily_evening", "Diário às 18h"),
        ("weekly_monday", "Segunda-feira às 9h"),
        ("hourly", "A cada hora"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(
        ProjectModel, on_delete=models.CASCADE, related_name="automation_rules"
    )
    name = models.CharField(max_length=120)
    enabled = models.BooleanField(default=True)
    trigger_type = models.CharField(max_length=30, choices=TRIGGER_CHOICES)
    # Para trigger=cron: {"schedule": "daily_morning"}
    # Para outros triggers: {}
    trigger_config = models.JSONField(default=dict, blank=True)
    # Ex: [{"field": "status", "op": "=", "value": "todo"}, {"field": "priority", "op": "=", "value": "high"}]
    conditions = models.JSONField(default=list, blank=True)
    action_type = models.CharField(max_length=30, choices=ACTION_CHOICES)
    # Ex: {"status": "doing"} | {"user_id": "..."} | {"label": "urgente"}
    action_config = models.JSONField(default=dict)
    last_run_at = models.DateTimeField(null=True, blank=True)
    next_run_at = models.DateTimeField(null=True, blank=True)
    run_count = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "projects_automation_rule"
        ordering = ["name"]

    def __str__(self) -> str:
        return f"{self.project.key} / {self.name}"


class ProjectRoleModel(models.Model):
    """Papel de projeto (Admin/Developer/Viewer + customizáveis).

    As capacidades de cada papel são definidas em código
    (``interface/api/capabilities.py``), keyadas pelo ``slug``. Atribuições
    explícitas de membros sobrepõem a derivação a partir do papel de workspace.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(
        ProjectModel, on_delete=models.CASCADE, related_name="roles"
    )
    name = models.CharField(max_length=80)
    slug = models.CharField(max_length=40, help_text="admin | developer | viewer | custom")
    is_default = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "projects_project_role"
        ordering = ["name"]
        unique_together = [("project", "slug")]

    def __str__(self) -> str:
        return f"{self.project.key}/{self.slug}"


class ProjectRoleMemberModel(models.Model):
    """Atribuição de um usuário a um papel de projeto."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    role = models.ForeignKey(
        ProjectRoleModel, on_delete=models.CASCADE, related_name="members"
    )
    user_id = models.UUIDField(db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "projects_project_role_member"
        unique_together = [("role", "user_id")]

    def __str__(self) -> str:
        return f"{self.user_id} → {self.role_id}"


class AutomationRunLogModel(models.Model):
    """Log de execução de uma regra de automação."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    rule = models.ForeignKey(
        AutomationRuleModel, on_delete=models.CASCADE, related_name="run_logs"
    )
    triggered_by = models.CharField(max_length=20, default="cron")  # cron | manual | event
    cards_affected = models.PositiveIntegerField(default=0)
    error = models.TextField(blank=True, default="")
    ran_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "projects_automation_run_log"
        ordering = ["-ran_at"]
