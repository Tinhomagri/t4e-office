"""Models Django do contexto sales (comercial)."""
import uuid

from django.db import models


class CustomerModel(models.Model):
    """Cliente (empresa ou pessoa física) pertencente a um workspace."""

    KIND_CHOICES = [
        ("company", "Empresa"),
        ("person", "Pessoa física"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # FK por id para o workspace do contexto identity (acoplamento por id)
    workspace = models.ForeignKey(
        "identity.WorkspaceModel", on_delete=models.CASCADE, related_name="customers"
    )
    kind = models.CharField(max_length=10, choices=KIND_CHOICES, default="company")
    name = models.CharField(max_length=160, help_text="Nome fantasia ou nome da pessoa")
    legal_name = models.CharField(max_length=160, blank=True, default="", help_text="Razão social")
    document = models.CharField(max_length=20, blank=True, default="", help_text="CNPJ ou CPF")
    email = models.EmailField(blank=True, default="")
    phone = models.CharField(max_length=30, blank=True, default="")
    website = models.CharField(max_length=200, blank=True, default="")
    notes = models.TextField(blank=True, default="")
    # Responsável comercial pela conta
    owner = models.ForeignKey(
        "identity.UserModel",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="owned_customers",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "sales_customer"
        verbose_name = "Cliente"
        verbose_name_plural = "Clientes"
        ordering = ["name"]
        indexes = [models.Index(fields=["workspace", "name"])]

    def __str__(self) -> str:
        return self.name


class ContactModel(models.Model):
    """Pessoa de contato vinculada a um cliente."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    customer = models.ForeignKey(
        CustomerModel, on_delete=models.CASCADE, related_name="contacts"
    )
    name = models.CharField(max_length=160)
    role = models.CharField(max_length=120, blank=True, default="", help_text="Cargo/função")
    email = models.EmailField(blank=True, default="")
    phone = models.CharField(max_length=30, blank=True, default="")
    is_primary = models.BooleanField(default=False, help_text="Contato principal do cliente")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "sales_contact"
        verbose_name = "Contato"
        verbose_name_plural = "Contatos"
        ordering = ["-is_primary", "name"]

    def __str__(self) -> str:
        return self.name


class PipelineStageModel(models.Model):
    """Estágio (coluna) do funil comercial de um workspace."""

    KIND_CHOICES = [
        ("open", "Aberto"),
        ("won", "Ganho"),
        ("lost", "Perdido"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        "identity.WorkspaceModel", on_delete=models.CASCADE, related_name="pipeline_stages"
    )
    name = models.CharField(max_length=80)
    slug = models.CharField(max_length=50)
    color = models.CharField(max_length=7, default="#6b7280")
    order = models.PositiveSmallIntegerField(default=0)
    probability_default = models.PositiveSmallIntegerField(
        default=0, help_text="Probabilidade padrão (0–100) aplicada ao entrar no estágio"
    )
    kind = models.CharField(max_length=10, choices=KIND_CHOICES, default="open")

    class Meta:
        db_table = "sales_pipeline_stage"
        verbose_name = "Estágio do funil"
        verbose_name_plural = "Estágios do funil"
        ordering = ["order"]
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "slug"], name="unique_workspace_stage_slug"
            )
        ]

    def __str__(self) -> str:
        return self.name


class DealModel(models.Model):
    """Negócio (oportunidade de venda) do funil comercial."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        "identity.WorkspaceModel", on_delete=models.CASCADE, related_name="deals"
    )
    title = models.CharField(max_length=200)
    customer = models.ForeignKey(
        CustomerModel, on_delete=models.CASCADE, related_name="deals"
    )
    contact = models.ForeignKey(
        ContactModel,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="deals",
    )
    stage = models.ForeignKey(
        PipelineStageModel, on_delete=models.PROTECT, related_name="deals"
    )
    amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    currency = models.CharField(max_length=3, default="BRL")
    probability = models.PositiveSmallIntegerField(default=0)
    expected_close_date = models.DateField(null=True, blank=True)
    source = models.CharField(max_length=60, blank=True, default="", help_text="Origem do lead")
    owner = models.ForeignKey(
        "identity.UserModel",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="owned_deals",
    )
    lost_reason = models.CharField(max_length=120, blank=True, default="")
    lost_notes = models.TextField(blank=True, default="")
    won_at = models.DateTimeField(null=True, blank=True)
    lost_at = models.DateTimeField(null=True, blank=True)
    # Projeto de entrega gerado ao ganhar o negócio (referência por string:
    # o app sales não importa os models do contexto projects)
    delivery_project = models.ForeignKey(
        "projects.ProjectModel",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="source_deals",
    )
    rank = models.CharField(max_length=64, blank=True, default="", help_text="Lexorank na coluna")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "sales_deal"
        verbose_name = "Negócio"
        verbose_name_plural = "Negócios"
        ordering = ["rank", "created_at"]
        indexes = [
            models.Index(fields=["workspace", "stage"]),
            models.Index(fields=["workspace", "expected_close_date"]),
        ]

    def __str__(self) -> str:
        return self.title


class DealActivityModel(models.Model):
    """Nota, tarefa ou reunião registrada num negócio."""

    KIND_CHOICES = [
        ("note", "Nota"),
        ("task", "Tarefa"),
        ("meeting", "Reunião"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    deal = models.ForeignKey(DealModel, on_delete=models.CASCADE, related_name="activities")
    kind = models.CharField(max_length=10, choices=KIND_CHOICES, default="note")
    content = models.TextField()
    author = models.ForeignKey(
        "identity.UserModel",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="authored_deal_activities",
    )
    # Prazo da tarefa / início da reunião
    due_date = models.DateTimeField(null=True, blank=True)
    end_date = models.DateTimeField(null=True, blank=True, help_text="Fim da reunião")
    assignee = models.ForeignKey(
        "identity.UserModel",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_deal_activities",
    )
    done_at = models.DateTimeField(null=True, blank=True)
    google_event_id = models.CharField(max_length=200, blank=True, default="")
    meet_url = models.CharField(max_length=300, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "sales_deal_activity"
        verbose_name = "Atividade do negócio"
        verbose_name_plural = "Atividades do negócio"
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["assignee", "due_date"])]

    def __str__(self) -> str:
        return f"{self.kind} · {self.deal_id}"


class ProposalModel(models.Model):
    """Proposta comercial (orçamento) gerada a partir de um negócio.

    Fica no contexto `sales` e não em um contexto próprio porque é inseparável
    do funil: nasce de um deal e o aceite realimenta o deal. Um contexto
    separado precisaria alcançar `sales` a cada operação.
    """

    STATUS_CHOICES = [
        ("draft", "Rascunho"),
        ("sent", "Enviada"),
        ("accepted", "Aceita"),
        ("rejected", "Recusada"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        "identity.WorkspaceModel", on_delete=models.CASCADE, related_name="proposals"
    )
    deal = models.ForeignKey(DealModel, on_delete=models.CASCADE, related_name="proposals")
    # Sequencial por workspace — é o número que o cliente cita ("proposta 42").
    number = models.PositiveIntegerField()
    title = models.CharField(max_length=200)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="draft")
    currency = models.CharField(max_length=3, default="BRL")
    # Desconto absoluto (não percentual): o que vai impresso no rodapé do PDF.
    discount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    intro = models.TextField(blank=True, default="", help_text="Texto de abertura")
    terms = models.TextField(blank=True, default="", help_text="Condições comerciais")
    valid_until = models.DateField(null=True, blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    sent_to = models.EmailField(blank=True, default="")
    accepted_at = models.DateTimeField(null=True, blank=True)
    rejected_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.CharField(max_length=200, blank=True, default="")
    created_by = models.ForeignKey(
        "identity.UserModel",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="authored_proposals",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "sales_proposal"
        verbose_name = "Proposta"
        verbose_name_plural = "Propostas"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "number"], name="uniq_proposal_number_per_workspace"
            )
        ]
        indexes = [
            models.Index(fields=["workspace", "status"]),
            models.Index(fields=["deal"]),
        ]

    def __str__(self) -> str:
        return f"#{self.number} · {self.title}"


class ProposalLineItemModel(models.Model):
    """Linha do orçamento: descrição, quantidade e valor unitário."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    proposal = models.ForeignKey(
        ProposalModel, on_delete=models.CASCADE, related_name="items"
    )
    description = models.CharField(max_length=300)
    # 4 casas: cobre hora fracionada (0,25h) sem virar dízima.
    quantity = models.DecimalField(max_digits=12, decimal_places=4, default=1)
    unit_price = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    position = models.PositiveSmallIntegerField(default=0)

    class Meta:
        db_table = "sales_proposal_line_item"
        verbose_name = "Item da proposta"
        verbose_name_plural = "Itens da proposta"
        ordering = ["position", "id"]

    def __str__(self) -> str:
        return self.description


class DealHistoryModel(models.Model):
    """Registro de mudança de campo num negócio (linha do tempo)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    deal = models.ForeignKey(DealModel, on_delete=models.CASCADE, related_name="history")
    author = models.ForeignKey(
        "identity.UserModel",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="deal_changes",
    )
    field = models.CharField(max_length=40)
    from_value = models.TextField(blank=True, default="")
    to_value = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "sales_deal_history"
        verbose_name = "Histórico do negócio"
        verbose_name_plural = "Históricos do negócio"
        ordering = ["created_at"]

    def __str__(self) -> str:
        return f"{self.field}: {self.from_value} → {self.to_value}"


class SalesGoalModel(models.Model):
    """Meta de faturamento de um workspace num mês, geral ou por vendedor."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        "identity.WorkspaceModel", on_delete=models.CASCADE, related_name="sales_goals"
    )
    period = models.CharField(max_length=7, help_text="Mês da meta no formato AAAA-MM")
    target_amount = models.DecimalField(max_digits=14, decimal_places=2)
    currency = models.CharField(max_length=3, default="BRL")
    # None = meta geral do workspace no período; preenchido = meta individual.
    owner = models.ForeignKey(
        "identity.UserModel",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="sales_goals",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "sales_goal"
        verbose_name = "Meta comercial"
        verbose_name_plural = "Metas comerciais"
        ordering = ["-period"]
        indexes = [models.Index(fields=["workspace", "period"])]
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "period", "owner"], name="unique_sales_goal_per_scope"
            )
        ]

    def __str__(self) -> str:
        scope = self.owner_id or "workspace"
        return f"{self.period} · {scope} · {self.target_amount} {self.currency}"


class LeadModel(models.Model):
    """Contato captado antes de virar cliente — entrada do funil."""

    STATUS_CHOICES = [
        ("new", "Novo"),
        ("contacted", "Contatado"),
        ("qualifying", "Qualificando"),
        ("qualified", "Qualificado"),
        ("disqualified", "Desqualificado"),
        ("converted", "Convertido"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        "identity.WorkspaceModel", on_delete=models.CASCADE, related_name="leads"
    )
    name = models.CharField(max_length=160)
    company = models.CharField(max_length=160, blank=True, default="")
    email = models.EmailField(blank=True, default="")
    phone = models.CharField(max_length=30, blank=True, default="")
    source = models.CharField(max_length=60, blank=True, default="", help_text="site, indicação, evento, csv_import…")
    score = models.PositiveSmallIntegerField(default=0)
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default="new")
    disqualify_reason = models.CharField(max_length=160, blank=True, default="")
    owner = models.ForeignKey(
        "identity.UserModel",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="owned_leads",
    )
    notes = models.TextField(blank=True, default="")
    first_contact_due_at = models.DateTimeField(
        help_text="Prazo do SLA de primeiro contato"
    )
    contacted_at = models.DateTimeField(null=True, blank=True)
    converted_at = models.DateTimeField(null=True, blank=True)
    # Referências pós-conversão — preenchidas juntas, nunca uma sem a outra.
    converted_deal = models.ForeignKey(
        DealModel, on_delete=models.SET_NULL, null=True, blank=True, related_name="source_lead"
    )
    converted_customer = models.ForeignKey(
        CustomerModel, on_delete=models.SET_NULL, null=True, blank=True, related_name="source_leads"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "sales_lead"
        verbose_name = "Lead"
        verbose_name_plural = "Leads"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["workspace", "status"]),
            models.Index(fields=["workspace", "owner"]),
        ]

    def __str__(self) -> str:
        return self.name
