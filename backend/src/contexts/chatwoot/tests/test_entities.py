"""Testes de normalização do JSON do Chatwoot para as entidades do domínio.

A API deles muda de formato entre endpoints (lista × detalhe, `payload` ×
`data`, timestamp Unix × string). Estes testes travam essa tradução: se o
Chatwoot mudar, quebra aqui e não na tela.
"""
from datetime import UTC

import pytest

from contexts.chatwoot.domain.entities.catalog import (
    Agent,
    CannedResponse,
    ChatContact,
    CustomAttributeDefinition,
    Inbox,
    Label,
)
from contexts.chatwoot.domain.entities.connection import ChatwootConnection
from contexts.chatwoot.domain.entities.conversation import (
    Conversation,
    ConversationPage,
    Message,
)
from shared.domain.errors import ValidationError


# ── Conexão ──────────────────────────────────────────────────────────────────
def test_connection_normaliza_url_removendo_barra_final():
    conn = ChatwootConnection(
        id=None, workspace_id="w1", base_url="https://chat.t4e.com.br/", account_id=3
    )
    assert conn.base_url == "https://chat.t4e.com.br"


def test_connection_recusa_url_sem_esquema():
    with pytest.raises(ValidationError):
        ChatwootConnection(id=None, workspace_id="w1", base_url="chat.t4e.com.br", account_id=1)


def test_connection_recusa_account_id_invalido():
    with pytest.raises(ValidationError):
        ChatwootConnection(
            id=None, workspace_id="w1", base_url="https://x.com", account_id=0
        )


def test_connection_so_e_usavel_com_token():
    base = {"id": None, "workspace_id": "w1", "base_url": "https://x.com", "account_id": 1}
    assert ChatwootConnection(**base).is_usable is False
    assert ChatwootConnection(**base, access_token="abc").is_usable is True


# ── Mensagem ─────────────────────────────────────────────────────────────────
def test_message_traduz_message_type_para_direcao():
    incoming = Message.from_api({"id": 1, "message_type": 0, "content": "oi"})
    outgoing = Message.from_api({"id": 2, "message_type": 1, "content": "olá"})
    activity = Message.from_api({"id": 3, "message_type": 2, "content": "resolvida"})
    assert incoming.direction == "incoming"
    assert outgoing.direction == "outgoing"
    assert activity.direction == "activity"


def test_message_converte_timestamp_unix_para_datetime_utc():
    msg = Message.from_api({"id": 1, "message_type": 0, "created_at": 1672531200})
    assert msg.created_at is not None
    assert msg.created_at.tzinfo == UTC
    assert msg.created_at.year == 2023


def test_message_privada_e_nota_interna():
    nota = Message.from_api({"id": 1, "message_type": 1, "private": True, "content": "x"})
    publica = Message.from_api({"id": 2, "message_type": 1, "content": "x"})
    assert nota.is_note is True
    assert publica.is_note is False


def test_message_herda_conversation_id_quando_a_api_omite():
    msg = Message.from_api({"id": 9, "message_type": 0}, conversation_id=42)
    assert msg.conversation_id == 42


def test_message_normaliza_anexos_e_remetente():
    msg = Message.from_api(
        {
            "id": 1,
            "message_type": 0,
            "sender": {"id": 7, "name": "Ana", "type": "contact", "thumbnail": "u"},
            "attachments": [
                {"id": 5, "file_type": "image", "data_url": "http://x/y.png", "file_size": 100}
            ],
        }
    )
    assert msg.sender is not None
    assert msg.sender.name == "Ana"
    assert msg.sender.kind == "contact"
    assert msg.sender.avatar_url == "u"
    assert len(msg.attachments) == 1
    assert msg.attachments[0].file_type == "image"


def test_message_sem_conteudo_nao_quebra():
    msg = Message.from_api({"id": 1, "message_type": 0, "content": None})
    assert msg.content == ""


# ── Conversa ─────────────────────────────────────────────────────────────────
def _raw_conversation(**overrides) -> dict:
    base = {
        "id": 12,
        "inbox_id": 3,
        "status": "open",
        "uuid": "abc",
        "priority": "high",
        "labels": ["urgente"],
        "custom_attributes": {"deal_id": "d-1"},
        "unread_count": 2,
        "created_at": 1672531200,
        "meta": {
            "sender": {"id": 5, "name": "Cliente", "email": "c@x.com"},
            "assignee": {"id": 9, "name": "Agente"},
            "channel": "Channel::WebWidget",
        },
        "messages": [{"id": 1, "message_type": 0, "content": "primeira"}],
    }
    base.update(overrides)
    return base


def test_conversation_extrai_contato_responsavel_e_canal_do_meta():
    conv = Conversation.from_api(_raw_conversation())
    assert conv.contact is not None
    assert conv.contact.name == "Cliente"
    assert conv.assignee is not None
    assert conv.assignee.name == "Agente"
    assert conv.channel == "Channel::WebWidget"


def test_conversation_expoe_deal_vinculado_dos_custom_attributes():
    assert Conversation.from_api(_raw_conversation()).deal_id == "d-1"
    sem = Conversation.from_api(_raw_conversation(custom_attributes={}))
    assert sem.deal_id == ""


def test_conversation_usa_ultima_mensagem_como_previa():
    conv = Conversation.from_api(
        _raw_conversation(
            messages=[
                {"id": 1, "message_type": 0, "content": "antiga"},
                {"id": 2, "message_type": 1, "content": "mais nova"},
            ]
        )
    )
    assert conv.last_message is not None
    assert conv.last_message.content == "mais nova"


def test_conversation_sem_responsavel_fica_none():
    conv = Conversation.from_api(_raw_conversation(meta={"sender": {"id": 5, "name": "C"}}))
    assert conv.assignee is None


def test_conversation_assignee_com_id_nulo_vira_none():
    # O Chatwoot manda `assignee: {}` (não `null`) quando ninguém assumiu.
    conv = Conversation.from_api(_raw_conversation(meta={"assignee": {}}))
    assert conv.assignee is None


# ── Página de conversas ──────────────────────────────────────────────────────
def test_conversation_page_le_o_envelope_data_da_listagem():
    page = ConversationPage.from_api(
        {
            "data": {
                "meta": {"mine_count": 5, "unassigned_count": 3, "all_count": 10},
                "payload": [_raw_conversation()],
            }
        }
    )
    assert page.mine_count == 5
    assert page.unassigned_count == 3
    assert page.all_count == 10
    assert len(page.conversations) == 1


def test_conversation_page_aceita_payload_na_raiz_do_filtro():
    page = ConversationPage.from_api({"payload": [_raw_conversation()], "meta": {"all_count": 1}})
    assert len(page.conversations) == 1
    assert page.all_count == 1


def test_conversation_page_vazia_nao_quebra():
    page = ConversationPage.from_api({})
    assert page.conversations == []
    assert page.all_count == 0


# ── Catálogo ─────────────────────────────────────────────────────────────────
def test_inbox_traduz_channel_type_para_rotulo_amigavel():
    assert Inbox.from_api({"id": 1, "name": "Site", "channel_type": "Channel::WebWidget"}).channel_label == "Chat do site"
    assert Inbox.from_api({"id": 2, "name": "Zap", "channel_type": "Channel::Whatsapp"}).channel_label == "WhatsApp"


def test_inbox_com_canal_desconhecido_cai_no_proprio_valor():
    inbox = Inbox.from_api({"id": 3, "name": "X", "channel_type": "Channel::Novo"})
    assert inbox.channel_label == "Channel::Novo"


def test_agent_usa_available_name_quando_name_falta():
    assert Agent.from_api({"id": 1, "available_name": "Bia"}).name == "Bia"


def test_label_tem_cor_padrao():
    assert Label.from_api({"id": 1, "title": "vip"}).color == "#1f93ff"


def test_canned_response_mapeia_atalho():
    resp = CannedResponse.from_api({"id": 1, "short_code": "oi", "content": "Olá!"})
    assert resp.short_code == "oi"
    assert resp.content == "Olá!"


def test_custom_attribute_aceita_valores_como_string_separada_por_virgula():
    attr = CustomAttributeDefinition.from_api(
        {"id": 1, "attribute_key": "nivel", "attribute_values": "alto,medio,baixo"}
    )
    assert attr.attribute_values == ["alto", "medio", "baixo"]


def test_custom_attribute_aceita_valores_como_lista():
    attr = CustomAttributeDefinition.from_api(
        {"id": 1, "attribute_key": "nivel", "attribute_values": ["a", "b"]}
    )
    assert attr.attribute_values == ["a", "b"]


def test_chat_contact_expoe_atributos_adicionais_como_propriedades():
    contact = ChatContact.from_api(
        {
            "id": 1,
            "name": "Ana",
            "additional_attributes": {
                "city": "Porto Alegre",
                "country": "Brasil",
                "company_name": "T4E",
            },
        }
    )
    assert contact.city == "Porto Alegre"
    assert contact.country == "Brasil"
    assert contact.company_name == "T4E"


def test_chat_contact_sem_atributos_devolve_string_vazia():
    contact = ChatContact.from_api({"id": 1, "name": "Ana"})
    assert contact.city == ""
    assert contact.company_name == ""
