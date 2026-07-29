"""Testes dos casos de uso com um gateway falso — nenhuma chamada HTTP real."""
from __future__ import annotations

import pytest

from contexts.chatwoot.application.use_cases.browse_inbox import ListConversations
from contexts.chatwoot.application.use_cases.converse import (
    ChangePriority,
    ChangeStatus,
    SendMessage,
    SetConversationLabels,
)
from contexts.chatwoot.application.use_cases.ingest_webhook import (
    IngestWebhook,
    verify_signature,
)
from contexts.chatwoot.application.use_cases.link_sales import LinkConversationToDeal
from contexts.chatwoot.application.use_cases.manage_connection import (
    ConnectChatwoot,
    VerifyConnection,
)
from contexts.chatwoot.application.use_cases.manage_contacts import UpdateContact
from contexts.chatwoot.domain.entities.connection import ChatwootConnection
from contexts.chatwoot.domain.entities.conversation import (
    Conversation,
    ConversationPage,
    Message,
)
from shared.domain.errors import (
    NotFoundError,
    PermissionDeniedError,
    UpstreamError,
    ValidationError,
)


class FakeGateway:
    """Duplo do Chatwoot: registra as chamadas em vez de fazer HTTP."""

    def __init__(self, *, verify_raises: Exception | None = None):
        self.calls: list[tuple] = []
        self._verify_raises = verify_raises

    def verify(self) -> dict:
        if self._verify_raises:
            raise self._verify_raises
        self.calls.append(("verify",))
        return {"name": "Ana", "email": "ana@t4e.com"}

    def list_conversations(self, **kwargs) -> ConversationPage:
        self.calls.append(("list_conversations", kwargs))
        return ConversationPage(
            conversations=[
                Conversation.from_api({"id": 1, "inbox_id": 1, "status": "open"}),
                Conversation.from_api({"id": 2, "inbox_id": 1, "status": "open"}),
            ],
            all_count=2,
        )

    def send_message(self, conversation_id, **kwargs) -> Message:
        self.calls.append(("send_message", conversation_id, kwargs))
        return Message.from_api(
            {"id": 99, "message_type": 1, "content": kwargs.get("content", "")},
            conversation_id=conversation_id,
        )

    def toggle_status(self, conversation_id, **kwargs) -> dict:
        self.calls.append(("toggle_status", conversation_id, kwargs))
        return {"ok": True}

    def toggle_priority(self, conversation_id, **kwargs) -> dict:
        self.calls.append(("toggle_priority", conversation_id, kwargs))
        return {"ok": True}

    def update_conversation_labels(self, conversation_id, labels) -> list[str]:
        self.calls.append(("labels", conversation_id, labels))
        return labels

    def update_custom_attributes(self, conversation_id, attributes) -> dict:
        self.calls.append(("attributes", conversation_id, attributes))
        return attributes

    def update_contact(self, contact_id, payload):
        self.calls.append(("update_contact", contact_id, payload))
        from contexts.chatwoot.domain.entities.catalog import ChatContact

        return ChatContact.from_api({"id": contact_id, **payload})


class FakeLinks:
    """Repositório de vínculos em memória."""

    def __init__(self, initial: dict | None = None):
        self.data = initial or {}
        self.linked: list[dict] = []

    def map_for(self, *, workspace_id, conversation_ids):
        return {cid: self.data[cid] for cid in conversation_ids if cid in self.data}

    def link(self, **kwargs):
        self.linked.append(kwargs)
        return kwargs


class FakeConnections:
    """Repositório de conexão em memória, com os mesmos contratos do Django."""

    def __init__(self, connection: ChatwootConnection | None = None):
        self.connection = connection
        self.errors: list[str] = []
        self.verified: list[dict] = []

    def get(self, workspace_id):
        return self.connection

    def require(self, workspace_id):
        if self.connection is None:
            raise NotFoundError("sem conexão")
        return self.connection

    def upsert(self, *, workspace_id, base_url, account_id, access_token, user_id=None):
        self.connection = ChatwootConnection(
            id="c1",
            workspace_id=workspace_id,
            base_url=base_url,
            account_id=account_id,
            access_token=access_token,
            webhook_secret="segredo",
        )
        return self.connection

    def mark_verified(self, workspace_id, *, agent):
        self.verified.append(agent)
        assert self.connection is not None
        self.connection.status = "connected"
        self.connection.agent_name = agent.get("name", "")
        return self.connection

    def mark_error(self, workspace_id, message):
        self.errors.append(message)

    def find_by_webhook_secret(self, secret):
        if self.connection and self.connection.webhook_secret == secret:
            return self.connection
        return None


class FakeEvents:
    def __init__(self):
        self.recorded: list[dict] = []
        self.pruned = 0

    def record(self, **kwargs):
        self.recorded.append(kwargs)
        return type("Row", (), {"id": f"e{len(self.recorded)}"})()

    def prune(self, **kwargs):
        self.pruned += 1
        return 0


class FakeQuerySet:
    """Imita `Model.objects.filter(...).first()` para o teste do vínculo."""

    def __init__(self, rows: list):
        self.rows = rows

    def filter(self, **kwargs):
        matches = [
            row
            for row in self.rows
            if all(str(getattr(row, key, None)) == str(value) for key, value in kwargs.items())
        ]
        return FakeQuerySet(matches)

    def first(self):
        return self.rows[0] if self.rows else None


class FakeDeal:
    def __init__(self, id, workspace_id, customer_id, title="Negócio"):
        self.id = id
        self.workspace_id = workspace_id
        self.customer_id = customer_id
        self.title = title


class FakeCustomer:
    def __init__(self, id, workspace_id, name="Cliente"):
        self.id = id
        self.workspace_id = workspace_id
        self.name = name


# ── Conexão ──────────────────────────────────────────────────────────────────
def test_connect_salva_verifica_e_marca_conectado():
    connections = FakeConnections()
    gateway = FakeGateway()
    result = ConnectChatwoot(
        connections=connections, build_gateway=lambda _conn: gateway
    ).execute(
        workspace_id="w1",
        base_url="https://chat.t4e.com.br",
        account_id=2,
        access_token="tok",
    )
    assert result.status == "connected"
    assert result.agent_name == "Ana"
    assert connections.verified == [{"name": "Ana", "email": "ana@t4e.com"}]


def test_connect_com_token_invalido_marca_erro_e_propaga():
    connections = FakeConnections()
    gateway = FakeGateway(verify_raises=PermissionDeniedError("token recusado"))
    use_case = ConnectChatwoot(connections=connections, build_gateway=lambda _c: gateway)

    with pytest.raises(PermissionDeniedError):
        use_case.execute(
            workspace_id="w1",
            base_url="https://chat.t4e.com.br",
            account_id=2,
            access_token="ruim",
        )
    # A credencial ruim fica salva, mas sinalizada — a tela mostra o motivo.
    assert connections.errors == ["token recusado"]


def test_connect_recusa_url_invalida_antes_de_chamar_a_api():
    connections = FakeConnections()
    gateway = FakeGateway()
    with pytest.raises(ValidationError):
        ConnectChatwoot(connections=connections, build_gateway=lambda _c: gateway).execute(
            workspace_id="w1", base_url="ftp://x", account_id=1, access_token="t"
        )
    assert gateway.calls == []


def test_test_connection_com_instancia_fora_do_ar_marca_erro():
    conn = ChatwootConnection(
        id="c1", workspace_id="w1", base_url="https://x.com", account_id=1, access_token="t"
    )
    connections = FakeConnections(conn)
    gateway = FakeGateway(verify_raises=UpstreamError("timeout"))
    with pytest.raises(UpstreamError):
        VerifyConnection(connections=connections, build_gateway=lambda _c: gateway).execute(
            workspace_id="w1"
        )
    assert connections.errors == ["timeout"]


# ── Caixa de entrada ─────────────────────────────────────────────────────────
def test_list_conversations_anexa_vinculo_comercial_numa_query_so():
    links = FakeLinks({1: {"deal_id": "d-1", "deal_title": "Contrato"}})
    page, link_map = ListConversations(gateway=FakeGateway(), links=links).execute(
        workspace_id="w1", status="open"
    )
    assert len(page.conversations) == 2
    assert link_map == {1: {"deal_id": "d-1", "deal_title": "Contrato"}}
    # A conversa 2 não tem vínculo — ausência é resposta válida, não erro.
    assert 2 not in link_map


def test_list_conversations_repassa_os_filtros_ao_gateway():
    gateway = FakeGateway()
    ListConversations(gateway=gateway, links=FakeLinks()).execute(
        workspace_id="w1", status="pending", inbox_id=7, labels=["vip"], query="nota"
    )
    _, kwargs = gateway.calls[0]
    assert kwargs["status"] == "pending"
    assert kwargs["inbox_id"] == 7
    assert kwargs["labels"] == ["vip"]
    assert kwargs["query"] == "nota"


# ── Ações na conversa ────────────────────────────────────────────────────────
def test_send_message_recusa_conteudo_vazio_sem_ir_na_api():
    gateway = FakeGateway()
    with pytest.raises(ValidationError):
        SendMessage(gateway=gateway).execute(conversation_id=1, content="   ")
    assert gateway.calls == []


def test_send_message_marca_nota_interna_como_privada():
    gateway = FakeGateway()
    SendMessage(gateway=gateway).execute(
        conversation_id=1, content="anotação do time", private=True
    )
    _, _, kwargs = gateway.calls[0]
    assert kwargs["private"] is True


def test_send_message_aceita_conteudo_vazio_quando_ha_anexo():
    gateway = FakeGateway()
    msg = SendMessage(gateway=gateway).execute(
        conversation_id=1, content="", content_attributes={"items": [1]}
    )
    assert msg.id == 99


def test_change_status_recusa_status_desconhecido():
    with pytest.raises(ValidationError):
        ChangeStatus(gateway=FakeGateway()).execute(conversation_id=1, status="arquivada")


def test_change_status_snoozed_exige_data_de_retorno():
    with pytest.raises(ValidationError):
        ChangeStatus(gateway=FakeGateway()).execute(conversation_id=1, status="snoozed")


def test_change_status_snoozed_com_data_passa():
    gateway = FakeGateway()
    ChangeStatus(gateway=gateway).execute(
        conversation_id=1, status="snoozed", snoozed_until="2026-08-01T10:00:00Z"
    )
    _, _, kwargs = gateway.calls[0]
    assert kwargs["snoozed_until"] == "2026-08-01T10:00:00Z"


def test_change_priority_aceita_none_para_limpar():
    gateway = FakeGateway()
    ChangePriority(gateway=gateway).execute(conversation_id=1, priority=None)
    _, _, kwargs = gateway.calls[0]
    assert kwargs["priority"] is None


def test_change_priority_recusa_valor_invalido():
    with pytest.raises(ValidationError):
        ChangePriority(gateway=FakeGateway()).execute(conversation_id=1, priority="altissima")


def test_set_labels_descarta_entradas_em_branco():
    gateway = FakeGateway()
    SetConversationLabels(gateway=gateway).execute(
        conversation_id=1, labels=["vip", "  ", "", " urgente "]
    )
    _, _, labels = gateway.calls[0]
    assert labels == ["vip", "urgente"]


# ── Contatos ─────────────────────────────────────────────────────────────────
def test_update_contact_filtra_campos_que_a_api_nao_aceita():
    gateway = FakeGateway()
    UpdateContact(gateway=gateway).execute(
        contact_id=5, payload={"name": "Ana", "hackeado": True, "email": "a@x.com"}
    )
    _, _, payload = gateway.calls[0]
    assert payload == {"name": "Ana", "email": "a@x.com"}


def test_update_contact_sem_campo_valido_falha():
    with pytest.raises(ValidationError):
        UpdateContact(gateway=FakeGateway()).execute(contact_id=5, payload={"xpto": 1})


# ── Ponte com o funil ────────────────────────────────────────────────────────
def test_link_exige_negocio_ou_cliente():
    with pytest.raises(ValidationError):
        LinkConversationToDeal(
            links=FakeLinks(),
            gateway=FakeGateway(),
            deals=FakeQuerySet([]),
            customers=FakeQuerySet([]),
        ).execute(workspace_id="w1", conversation_id=1)


def test_link_recusa_negocio_de_outro_workspace():
    deals = FakeQuerySet([FakeDeal(id="d-1", workspace_id="OUTRO", customer_id="c-1")])
    with pytest.raises(NotFoundError):
        LinkConversationToDeal(
            links=FakeLinks(), gateway=FakeGateway(), deals=deals, customers=FakeQuerySet([])
        ).execute(workspace_id="w1", conversation_id=1, deal_id="d-1")


def test_link_por_negocio_preenche_o_cliente_automaticamente():
    deals = FakeQuerySet([FakeDeal(id="d-1", workspace_id="w1", customer_id="c-1")])
    customers = FakeQuerySet([FakeCustomer(id="c-1", workspace_id="w1")])
    links = FakeLinks()
    result = LinkConversationToDeal(
        links=links, gateway=FakeGateway(), deals=deals, customers=customers
    ).execute(workspace_id="w1", conversation_id=10, deal_id="d-1")

    assert result["customer_id"] == "c-1"
    assert result["mirrored_to_chatwoot"] is True
    assert links.linked[0]["conversation_id"] == 10


def test_link_sobrevive_ao_chatwoot_fora_do_ar():
    """O vínculo é nosso: se o espelho falhar, o local continua valendo."""

    class BrokenGateway(FakeGateway):
        def update_custom_attributes(self, conversation_id, attributes):
            raise UpstreamError("instância fora do ar")

    deals = FakeQuerySet([FakeDeal(id="d-1", workspace_id="w1", customer_id="c-1")])
    customers = FakeQuerySet([FakeCustomer(id="c-1", workspace_id="w1")])
    links = FakeLinks()
    result = LinkConversationToDeal(
        links=links, gateway=BrokenGateway(), deals=deals, customers=customers
    ).execute(workspace_id="w1", conversation_id=10, deal_id="d-1")

    assert result["mirrored_to_chatwoot"] is False
    assert len(links.linked) == 1


# ── Webhook ──────────────────────────────────────────────────────────────────
def test_verify_signature_confere_hmac():
    body = b'{"event":"message_created"}'
    import hashlib
    import hmac as hmac_mod

    assinatura = hmac_mod.new(b"segredo", body, hashlib.sha256).hexdigest()
    assert verify_signature(secret="segredo", body=body, signature=assinatura) is True
    assert verify_signature(secret="segredo", body=body, signature="errada") is False
    assert verify_signature(secret="", body=body, signature=assinatura) is False


def _connected() -> FakeConnections:
    return FakeConnections(
        ChatwootConnection(
            id="c1",
            workspace_id="w1",
            base_url="https://x.com",
            account_id=1,
            access_token="t",
            webhook_secret="segredo",
        )
    )


def test_webhook_recusa_segredo_desconhecido():
    with pytest.raises(PermissionDeniedError):
        IngestWebhook(connections=_connected(), events=FakeEvents()).execute(
            webhook_secret="outro", payload={"event": "message_created"}
        )


def test_webhook_registra_evento_conhecido_e_extrai_ids():
    events = FakeEvents()
    result = IngestWebhook(connections=_connected(), events=events).execute(
        webhook_secret="segredo",
        payload={
            "event": "message_created",
            "conversation": {"id": 42, "meta": {"sender": {"id": 7}}},
        },
    )
    assert result["ignored"] is False
    assert events.recorded[0]["conversation_id"] == 42
    assert events.recorded[0]["contact_id"] == 7
    assert events.pruned == 1


def test_webhook_ignora_evento_fora_da_lista():
    events = FakeEvents()
    result = IngestWebhook(connections=_connected(), events=events).execute(
        webhook_secret="segredo", payload={"event": "algo_novo_do_chatwoot"}
    )
    assert result["ignored"] is True
    assert events.recorded == []


def test_webhook_de_conversa_usa_o_proprio_payload_como_conversa():
    events = FakeEvents()
    IngestWebhook(connections=_connected(), events=events).execute(
        webhook_secret="segredo",
        payload={"event": "conversation_status_changed", "id": 55, "status": "resolved"},
    )
    assert events.recorded[0]["conversation_id"] == 55


def test_webhook_com_assinatura_invalida_e_recusado():
    with pytest.raises(PermissionDeniedError):
        IngestWebhook(connections=_connected(), events=FakeEvents()).execute(
            webhook_secret="segredo",
            payload={"event": "message_created"},
            raw_body=b'{"event":"message_created"}',
            signature="assinatura-forjada",
        )


def test_webhook_sem_assinatura_e_aceito_quando_nao_configurada():
    """Assinar é opcional no Chatwoot; o segredo da URL já autoriza."""
    events = FakeEvents()
    result = IngestWebhook(connections=_connected(), events=events).execute(
        webhook_secret="segredo", payload={"event": "contact_updated", "id": 3}
    )
    assert result["ignored"] is False
    assert events.recorded[0]["contact_id"] == 3
