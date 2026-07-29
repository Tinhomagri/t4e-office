"""Models Django do contexto chatwoot (atendimento).

O Chatwoot é a fonte da verdade das conversas — não replicamos a caixa de
entrada no nosso banco. Aqui guardamos só o que é *nosso*:

* `ChatwootConnectionModel` — como falar com a instância do workspace
  (URL, account_id e token cifrado).
* `ConversationLinkModel` — a ponte com o Comercial: qual conversa do Chatwoot
  pertence a qual negócio/cliente do contexto `sales`.
* `WebhookEventModel` — log dos eventos recebidos, usado para o feed em tempo
  real e para reprocessar quando algo falha.
"""
import uuid

from django.db import models


class ChatwootConnectionModel(models.Model):
    """Credenciais e estado da instância Chatwoot de um workspace.

    Uma conexão por workspace: o Chatwoot já tem multi-inbox interno, então não
    faz sentido plugar duas contas no mesmo workspace. O `access_token` é
    cifrado com Fernet (mesma chave dos demais segredos do projeto).
    """

    STATUS_CHOICES = [
        ("connected", "Conectada"),
        ("error", "Com erro"),
        ("disconnected", "Desconectada"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.OneToOneField(
        "identity.WorkspaceModel",
        on_delete=models.CASCADE,
        related_name="chatwoot_connection",
    )
    base_url = models.CharField(
        max_length=300,
        help_text="URL da instância, ex.: https://app.chatwoot.com ou https://chat.t4e.com.br",
    )
    account_id = models.PositiveIntegerField(help_text="ID da conta no Chatwoot")
    access_token_encrypted = models.TextField(
        blank=True, default="", help_text="api_access_token do agente/bot (cifrado)"
    )
    # Segredo compartilhado que validamos no webhook de entrada. Gerado por nós
    # e colado na URL do webhook configurado no Chatwoot.
    webhook_secret = models.CharField(max_length=64, blank=True, default="")
    status = models.CharField(max_length=14, choices=STATUS_CHOICES, default="disconnected")
    last_error = models.TextField(blank=True, default="")
    last_verified_at = models.DateTimeField(null=True, blank=True)
    # Snapshot do agente dono do token — mostrado na tela de configuração.
    agent_name = models.CharField(max_length=160, blank=True, default="")
    agent_email = models.CharField(max_length=200, blank=True, default="")
    created_by = models.ForeignKey(
        "identity.UserModel", on_delete=models.SET_NULL, null=True, blank=True
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "chatwoot_connection"
        verbose_name = "Conexão Chatwoot"
        verbose_name_plural = "Conexões Chatwoot"

    def __str__(self) -> str:
        return f"{self.base_url}#{self.account_id}"


class ConversationLinkModel(models.Model):
    """Vínculo entre uma conversa do Chatwoot e o funil comercial.

    Guardamos localmente (e não só em `custom_attributes` no Chatwoot) para
    conseguir responder "quais conversas deste negócio?" sem varrer a API.
    O espelho em `custom_attributes` é enviado ao Chatwoot para o agente também
    enxergar o vínculo na interface deles.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        "identity.WorkspaceModel", on_delete=models.CASCADE, related_name="chatwoot_links"
    )
    conversation_id = models.PositiveIntegerField(help_text="ID da conversa no Chatwoot")
    deal = models.ForeignKey(
        "sales.DealModel",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="chatwoot_conversations",
    )
    customer = models.ForeignKey(
        "sales.CustomerModel",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="chatwoot_conversations",
    )
    linked_by = models.ForeignKey(
        "identity.UserModel", on_delete=models.SET_NULL, null=True, blank=True
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "chatwoot_conversation_link"
        verbose_name = "Vínculo de conversa"
        verbose_name_plural = "Vínculos de conversa"
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "conversation_id"], name="uniq_chatwoot_link_ws_conv"
            )
        ]
        indexes = [models.Index(fields=["deal"]), models.Index(fields=["customer"])]

    def __str__(self) -> str:
        return f"conversa {self.conversation_id} → {self.deal_id or self.customer_id}"


class WebhookEventModel(models.Model):
    """Evento recebido do Chatwoot, cru, para o feed em tempo real e replay."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        "identity.WorkspaceModel", on_delete=models.CASCADE, related_name="chatwoot_events"
    )
    event = models.CharField(max_length=60, help_text="message_created, conversation_updated…")
    # Ids extraídos para permitir filtrar sem abrir o JSON.
    conversation_id = models.PositiveIntegerField(null=True, blank=True)
    contact_id = models.PositiveIntegerField(null=True, blank=True)
    payload = models.JSONField(default=dict)
    processed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "chatwoot_webhook_event"
        verbose_name = "Evento de webhook"
        verbose_name_plural = "Eventos de webhook"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["workspace", "-created_at"], name="idx_cw_event_ws_at"),
            models.Index(fields=["conversation_id"], name="idx_cw_event_conv"),
        ]

    def __str__(self) -> str:
        return f"{self.event} @ {self.created_at:%d/%m %H:%M}"
