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
    # Chave do item na ferramenta de origem, quando veio de importação (ex.:
    # "GES" no Jira). É o que torna a importação repetível: reimportar atualiza
    # o mesmo registro em vez de criar outro.
    external_key = models.CharField(max_length=60, blank=True, default="", db_index=True)
    # Template de criação: define workflow inicial (software | campanha | social | conteudo)
    template = models.CharField(max_length=20, default="software")
    # Quem enxerga o board.
    #
    # "restricted" (padrão): só quem tem papel atribuído no projeto — mais
    # owner/admin do workspace, que precisam administrar. "workspace": qualquer
    # membro do workspace. O padrão é fechado porque abrir depois é decisão
    # consciente; descobrir que o board sigiloso estava aberto, não.
    VISIBILITY_CHOICES = [
        ("restricted", "Restrito a quem tem acesso"),
        ("workspace", "Todo o workspace"),
    ]
    visibility = models.CharField(
        max_length=12, choices=VISIBILITY_CHOICES, default="restricted", db_index=True
    )
    # Squad dona do board. Quem está na squad enxerga o projeto sem precisar de
    # papel individual — é o que evita atribuir pessoa a pessoa em dezenas de
    # projetos. Quem é de fora entra por papel explícito.
    squad = models.ForeignKey(
        "estimation.SquadModel",
        on_delete=models.SET_NULL,
        related_name="projects",
        null=True,
        blank=True,
    )
    description = models.TextField(blank=True, default="")
    # Categoria livre para agrupar projetos no portfólio (equivalente ao "Categoria" do Jira).
    category = models.CharField(max_length=40, blank=True, default="")
    # Avatar do projeto. Se `avatar_image` existir ela vence; senão cai no par
    # emoji+cor (estilo Notion).
    avatar_emoji = models.CharField(max_length=8, blank=True, default="")
    avatar_color = models.CharField(max_length=7, default="#6366f1")
    # Data URI (`data:image/webp;base64,…`), não caminho de arquivo: o deploy é
    # serverless na Vercel, onde o disco é efêmero e um FileField sumiria no
    # próximo deploy. O front reduz a imagem para 128×128 antes de enviar, então
    # a string fica na casa dos KB.
    avatar_image = models.TextField(blank=True, default="")
    # Lead do projeto e responsável padrão de cards novos (FK por id, como workspace).
    lead_id = models.UUIDField(null=True, blank=True)
    default_assignee_id = models.UUIDField(null=True, blank=True)
    # Projeto arquivado sai das listas e do seletor, mas continua acessível por
    # link direto — deletar perdia todo o histórico de decisão junto.
    archived_at = models.DateTimeField(null=True, blank=True, db_index=True)
    # Link público de acompanhamento: token vazio = link desativado. Quem tem
    # o link vê o board inteiro (cards, descrição, comentários) SEM LOGIN —
    # é um espelho read-only do sistema. `public_allow_create` libera só a
    # criação de card novo; nunca a alteração dos que já existem.
    # NULL (não string vazia) quando desativado — assim vários projetos sem
    # link não colidem na constraint de unicidade (Postgres permite múltiplos
    # NULL, mas só uma linha com "").
    public_token = models.CharField(max_length=48, unique=True, null=True, blank=True, default=None)
    public_allow_create = models.BooleanField(default=False)
    # Código de acesso ao board público: link sozinho não basta pra ver nada
    # — a PRIMEIRA vez pede este código também, compartilhado por um canal
    # separado (WhatsApp, e-mail). Uma vez validado, o navegador lembra (não
    # pede de novo). Sem código configurado, o link sozinho já libera (como
    # era antes). Sem `unique`: o escopo já é o projeto (chega via token).
    public_access_code = models.CharField(max_length=16, null=True, blank=True, default=None)
    # Prazo final do projeto (contrato). Digitado à mão ou aplicado a partir da
    # extração por IA de um contrato enviado — usado no cálculo de saúde do
    # portfólio (progresso real vs. tempo decorrido até esta data).
    deadline = models.DateField(null=True, blank=True)
    # Quem do workspace NÃO quer bipe/notificação de mensagem do mural deste
    # board. Lista de user_id (string) em vez de M2M: evita ter que popular
    # "todo mundo" na migração — vazio já significa "ninguém excluído", igual
    # o comportamento de antes desta configuração existir.
    mural_notification_excluded_user_ids = models.JSONField(default=list, blank=True)
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


class AnonymousReportModel(models.Model):
    """Denúncia enviada pelo canal público, sem vínculo com quem a enviou.

    Deliberadamente não há usuário, workspace, IP, sessão, user-agent nem
    timestamp neste registro. O identificador técnico não é devolvido pela API.
    """

    CATEGORY_CHOICES = [
        ("conduct", "Conduta inadequada"),
        ("harassment", "Assédio ou discriminação"),
        ("security", "Segurança ou saúde"),
        ("fraud", "Fraude ou irregularidade"),
        ("other", "Outro"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES)
    description = models.TextField()

    class Meta:
        db_table = "projects_anonymous_report"
        verbose_name = "Denúncia anônima"
        verbose_name_plural = "Denúncias anônimas"

    def __str__(self) -> str:
        return f"Denúncia anônima: {self.category}"


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
    external_key = models.CharField(max_length=60, blank=True, default="", db_index=True)
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="planned")
    # Timestamps do ciclo de vida (iniciar/concluir sprint, como no Jira)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
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
        ("feature", "História"),
        ("bug", "Bug"),
        ("debt", "Débito técnico"),
        ("spike", "Spike"),
        ("chore", "Tarefa"),
        ("epic", "Épico"),
        # Tipos de marketing
        ("post", "Post"),
        ("peca", "Peça"),
        ("campanha", "Campanha"),
        ("artigo", "Artigo"),
        ("email", "E-mail"),
    ]
    PRIORITY_CHOICES = [
        ("low", "Baixa"),
        ("medium", "Média"),
        ("high", "Alta"),
        ("urgent", "Urgente"),
    ]
    RESOLUTION_CHOICES = [
        ("done", "Entregue"),
        ("wont_do", "Não será feito"),
        ("duplicate", "Duplicado"),
        ("cannot_reproduce", "Não reproduzido"),
        ("incomplete", "Incompleto"),
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
    # Épico ao qual o card pertence (hierarquia Jira: Épico → Story/Task → Subtask).
    # Sempre aponta para um card com type="epic"; validado na camada de aplicação.
    epic = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="epic_children",
    )
    # Cor do épico (só faz sentido quando type="epic") — paleta Atlassian.
    epic_color = models.CharField(max_length=7, blank=True, default="")
    labels = models.JSONField(default=list, blank=True)
    # Marketing: canal de publicação (instagram, linkedin, blog, email…) e data
    # de publicação — base do calendário editorial.
    channel = models.CharField(max_length=30, blank=True, default="")
    publish_date = models.DateField(null=True, blank=True, db_index=True)
    start_date = models.DateField(null=True, blank=True)
    due_date = models.DateField(null=True, blank=True)
    order = models.IntegerField(default=0, help_text="Ordem dentro da coluna")
    # Rank lexicográfico (Lexorank) — ordenação estável no backlog/board sem renumerar.
    rank = models.CharField(max_length=64, blank=True, default="", db_index=True)
    # Procedência: marca cards criados pela IA do copiloto (Fase 2)
    source = models.CharField(max_length=20, default="manual")
    external_key = models.CharField(max_length=60, blank=True, default="", db_index=True)
    # Nome de quem estava responsável na origem e não tem conta aqui. Sem isto a
    # informação se perde: o card viria sem responsável e sem pista de quem era.
    external_assignee = models.CharField(max_length=120, blank=True, default="")
    # Observação livre de quem está com o card em "Em andamento" — só o
    # assignee edita. Mostrada no balão de hover do escritório virtual.
    working_note = models.TextField(blank=True, default="")
    # Desfecho: "está em Concluído" e "foi entregue" são coisas diferentes. Sem
    # isto, card cancelado e card entregue pesam igual na velocity.
    resolution = models.CharField(
        max_length=20, choices=RESOLUTION_CHOICES, blank=True, default="", db_index=True
    )
    resolved_at = models.DateTimeField(null=True, blank=True)
    # Tempo em segundos, para casar com WorklogModel.time_seconds.
    original_estimate_seconds = models.PositiveIntegerField(null=True, blank=True)
    remaining_estimate_seconds = models.PositiveIntegerField(null=True, blank=True)
    # Sinalizador de atenção (igual "Flag" do Jira) — aura laranja + "!" no
    # card. Cliente marca na criação pelo link público quando é urgente; time
    # também pode marcar/desmarcar depois.
    flagged = models.BooleanField(default=False)
    # Arquivado sai do board e dos relatórios, mas preserva o histórico.
    archived_at = models.DateTimeField(null=True, blank=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "projects_card"
        verbose_name = "Card"
        verbose_name_plural = "Cards"
        # "-flagged" antes de "rank": card marcado como urgente sempre no topo
        # da coluna, na frente de qualquer rank — não importa quando foi
        # criado ou reordenado, sinalizado sobe e fica lá até ser desmarcado.
        ordering = ["status", "-flagged", "rank", "order", "number"]
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
    external_key = models.CharField(max_length=60, blank=True, default="", db_index=True)
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
    # Nulo quando o anexo veio do link público (cliente sem conta) — anexo do
    # time sempre tem autor; anexo do board público nunca tem usuário logado.
    author = models.ForeignKey(
        "identity.UserModel", on_delete=models.CASCADE, related_name="attachments",
        null=True, blank=True,
    )
    filename = models.CharField(max_length=255)
    file = models.FileField(upload_to="attachments/%Y/%m/")
    mime_type = models.CharField(max_length=100, blank=True, default="")
    size = models.PositiveIntegerField(default=0, help_text="Tamanho em bytes")
    # Versionamento de peça: anexos do mesmo group_id são versões da mesma arte.
    group_id = models.UUIDField(default=uuid.uuid4, db_index=True)
    version = models.PositiveSmallIntegerField(default=1)
    # Decisão de aprovação da versão: "" (pendente) | approved | rejected
    approval_status = models.CharField(max_length=10, blank=True, default="")
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
    # Limite de WIP da coluna no board. None = sem limite. Estava no localStorage
    # do front (board.prefs.store) e passou a ser config de projeto.
    wip_limit = models.PositiveSmallIntegerField(null=True, blank=True)
    # "Card aqui significa que a pessoa está trabalhando nisso agora."
    #
    # É o que faz o boneco sentar na mesa no Escritório e o hover contar desde
    # quando. Antes isso era o slug "doing" cravado no código: quadro com outro
    # nome de coluna simplesmente não acionava nada. Como configuração, cada
    # time escolhe a própria coluna — e pode ter mais de uma.
    is_working = models.BooleanField(default=False)
    # "Card aqui significa que foi entregue." Mesma ideia do `is_working`, mas
    # pro fim do fluxo: a categoria Jira ("done") sozinha não basta, porque
    # "Cancelado"/"Não vai fazer" também cai nela — sem uma flag própria, o
    # atalho de concluir card podia cair na coluna errada.
    is_done = models.BooleanField(default=False)

    class Meta:
        db_table = "projects_workflow_status"
        ordering = ["order"]
        unique_together = [("project", "slug")]

    def __str__(self) -> str:
        return f"{self.project.key}/{self.slug}"


class SavedFilterModel(models.Model):
    """Filtro salvo (JQL) por projeto — chips de quick filter estilo Jira."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(
        ProjectModel, on_delete=models.CASCADE, related_name="saved_filters"
    )
    owner_id = models.UUIDField(db_index=True)
    name = models.CharField(max_length=80)
    jql = models.TextField()
    shared = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "projects_saved_filter"
        ordering = ["created_at"]

    def __str__(self) -> str:
        return f"{self.project.key} / {self.name}"


class DocumentModel(models.Model):
    """Documento colaborativo do projeto (aba Documentos) — conteúdo rich-text
    em HTML, persistido no servidor e visível para todo o time do projeto
    (estilo Google Docs / Word: um só documento, compartilhado, não local)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(
        ProjectModel, on_delete=models.CASCADE, related_name="documents"
    )
    title = models.CharField(max_length=200, blank=True, default="Sem título")
    content = models.TextField(blank=True, default="")
    created_by = models.UUIDField()
    updated_by = models.UUIDField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "projects_document"
        ordering = ["-updated_at"]

    def __str__(self) -> str:
        return f"{self.project.key} / {self.title}"


class BoardMessageModel(models.Model):
    """Mural do board: lembrete/aviso de mão dupla entre time e quem só tem o
    link público — sem login do lado de fora, sem card/comentário no meio."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(
        ProjectModel, on_delete=models.CASCADE, related_name="board_messages"
    )
    # Texto livre, não FK: quem escreve de fora não tem conta pra apontar.
    author_name = models.CharField(max_length=80, blank=True, default="")
    body = models.TextField()
    # Distingue quem postou sem precisar decifrar o nome — a bolha da UI
    # espelha em lados diferentes conforme isto.
    from_team = models.BooleanField(default=False)
    # Resposta com citação (igual WhatsApp) — pode ter mais de uma pessoa
    # falando no mesmo mural (vários clientes + time), sem isto não dava pra
    # saber a quem uma mensagem respondia. SET_NULL: apagar a original não
    # pode derrubar quem respondeu a ela.
    reply_to = models.ForeignKey(
        "self", on_delete=models.SET_NULL, null=True, blank=True, related_name="replies"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "projects_board_message"
        ordering = ["created_at"]


class NotificationModel(models.Model):
    """Notificação em tempo real para um usuário."""

    TYPE_CHOICES = [
        ("card_assigned", "Card atribuído"),
        ("card_commented", "Comentário adicionado"),
        ("card_status_changed", "Status alterado"),
        ("card_approval", "Peça aprovada/reprovada"),
        ("automation_ran", "Automação executada"),
        ("sprint_started", "Sprint iniciada"),
        ("meeting_reminder", "Lembrete de reunião"),
        ("board_message", "Mensagem no mural"),
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


class ProjectDeleteGrantModel(models.Model):
    """Concessão individual de `delete_issue` a um usuário sem papel admin.

    Papéis dão capacidades em bloco (capabilities.py); deletar card é
    perigoso demais pra virar padrão de um papel inteiro, então é concedido
    pessoa a pessoa pelo admin do projeto.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(
        ProjectModel, on_delete=models.CASCADE, related_name="delete_grants"
    )
    user_id = models.UUIDField(db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "projects_project_delete_grant"
        unique_together = [("project", "user_id")]

    def __str__(self) -> str:
        return f"{self.user_id} pode deletar cards em {self.project_id}"


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


class CardMetricModel(models.Model):
    """Métricas de desempenho de uma peça publicada (entrada manual por ora).

    Uma linha por card. Alimenta o dashboard de campanha (alcance, engajamento,
    cliques, conversões) e permite ranquear canal/peça por resultado.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    card = models.OneToOneField(
        "CardModel", on_delete=models.CASCADE, related_name="metric"
    )
    reach = models.PositiveIntegerField(default=0)
    impressions = models.PositiveIntegerField(default=0)
    likes = models.PositiveIntegerField(default=0)
    comments = models.PositiveIntegerField(default=0)
    shares = models.PositiveIntegerField(default=0)
    clicks = models.PositiveIntegerField(default=0)
    conversions = models.PositiveIntegerField(default=0)
    updated_by = models.ForeignKey(
        "identity.UserModel", on_delete=models.SET_NULL, null=True, blank=True
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "projects_card_metric"
        verbose_name = "Métrica de peça"
        verbose_name_plural = "Métricas de peças"

    def __str__(self) -> str:
        return f"metric @ {self.card_id}"

    @property
    def engagement(self) -> int:
        return self.likes + self.comments + self.shares


class BoardConfigModel(models.Model):
    """Configuração do quadro de um projeto (equivalente ao "Board settings" do Jira).

    Uma linha por projeto, criada sob demanda com os defaults abaixo. Substitui o
    que antes vivia só no localStorage do front (swimlane + WIP), que se perdia
    entre navegadores e não era compartilhado com o time.
    """

    SWIMLANE_CHOICES = [
        ("none", "Sem agrupamento"),
        ("epic", "Epic"),
        ("assignee", "Responsável"),
        ("priority", "Prioridade"),
        ("subtask", "Subtarefa"),
    ]

    # Como a cor da borda do card é decidida no board.
    CARD_COLOR_CHOICES = [
        ("none", "Sem cor"),
        ("priority", "Prioridade"),
        ("issue_type", "Tipo do ticket"),
        ("assignee", "Responsável"),
        ("epic", "Epic"),
    ]

    # Campos que podem ser ligados/desligados no card do board. A chave é o nome
    # usado pelo front; `summary` não entra porque é sempre visível (como no Jira).
    AVAILABLE_CARD_FIELDS = [
        "key", "issue_type", "priority", "assignee", "labels", "epic",
        "due_date", "start_date", "story_points", "status", "reporter",
        "subtask_progress", "created_at", "updated_at", "cover_image",
    ]

    DEFAULT_CARD_FIELDS = [
        "key", "issue_type", "priority", "assignee", "labels", "epic",
        "due_date", "story_points", "subtask_progress",
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.OneToOneField(
        ProjectModel, on_delete=models.CASCADE, related_name="board_config"
    )
    swimlane_mode = models.CharField(max_length=12, choices=SWIMLANE_CHOICES, default="none")
    # Lista de chaves de AVAILABLE_CARD_FIELDS visíveis no card.
    card_fields = models.JSONField(default=list, blank=True)
    card_color_rule = models.CharField(max_length=12, choices=CARD_COLOR_CHOICES, default="none")
    # Mapa valor→cor hex usado quando card_color_rule != "none".
    # Ex.: {"high": "#ef4444", "low": "#10b981"} para a regra "priority".
    card_color_map = models.JSONField(default=dict, blank=True)
    # Esconde cards concluídos há mais de N dias na coluna "done". 0 = nunca
    # esconder. Default 14 (igual Jira) — board com muito histórico travava
    # renderizando centenas de card já entregue há meses.
    hide_done_after_days = models.PositiveSmallIntegerField(default=14)
    # Feature flags do projeto (aba "Funções" do Jira).
    sprints_enabled = models.BooleanField(default=True)
    estimation_enabled = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "projects_board_config"
        verbose_name = "Configuração de quadro"
        verbose_name_plural = "Configurações de quadro"

    def __str__(self) -> str:
        return f"board-config @ {self.project_id}"
