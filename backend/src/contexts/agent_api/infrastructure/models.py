"""Modelos da API de agentes: identidade do agente (só o hash do token) e o
log de auditoria de toda requisição feita com token de agente."""
import uuid

from django.db import models


class AgentTokenModel(models.Model):
    """Um agente de IA = um token. O token em texto nunca chega aqui: o
    Leonardo gera na máquina dele e manda só o SHA-256 (ver comando
    `importar_tokens_agentes`). Não é usuário: não vale nas rotas normais."""

    id = models.SlugField(primary_key=True, max_length=60)
    token_hash = models.CharField(max_length=64, unique=True)
    ativo = models.BooleanField(default=True)
    escopos = models.JSONField(default=list)
    # Workspaces que o agente enxerga — toda rota filtra por eles.
    workspaces = models.ManyToManyField(
        "identity.WorkspaceModel", related_name="agent_tokens", blank=True
    )
    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "agent_api_token"
        verbose_name = "Token de agente"
        verbose_name_plural = "Tokens de agente"

    def __str__(self) -> str:
        return self.id


class AgentAuditLogModel(models.Model):
    """Toda requisição com token de agente, inclusive as barradas (401/403/429).
    `agente` nulo = token que não bate com nenhum agente."""

    agente = models.ForeignKey(
        AgentTokenModel,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="auditoria",
    )
    metodo = models.CharField(max_length=10)
    rota = models.CharField(max_length=500)
    status = models.PositiveSmallIntegerField()
    correlation_id = models.CharField(max_length=120, blank=True, default="")
    criado_em = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = "agent_api_audit"
        ordering = ["-criado_em"]
        verbose_name = "Auditoria de agente"
        verbose_name_plural = "Auditoria de agentes"


class TrackedTimeEntryModel(models.Model):
    """Trecho fechado de tempo rastreado (card em andamento e não pausado),
    por pessoa. Cópia materializada do que `projects.domain.working_time`
    deriva do histórico — o histórico é a fonte da verdade; isto existe para
    `/horas` ser uma consulta simples com id estável."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    card = models.ForeignKey(
        "projects.CardModel", on_delete=models.CASCADE, related_name="tracked_time"
    )
    pessoa = models.ForeignKey(
        "identity.UserModel",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="tracked_time",
    )
    inicio = models.DateTimeField()
    fim = models.DateTimeField()
    segundos = models.PositiveIntegerField()
    updated_at = models.DateTimeField(auto_now=True, db_index=True)

    class Meta:
        db_table = "agent_api_tracked_time"
        constraints = [
            models.UniqueConstraint(fields=["card", "inicio"], name="tracked_time_card_inicio")
        ]
