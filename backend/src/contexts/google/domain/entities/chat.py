"""Estruturas de domínio para o Google Chat (DMs e espaços em grupo)."""
from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class ChatMember:
    """Um membro de um espaço — nome de exibição é o que dá pra montar sem
    outra chamada à API (o Chat não devolve e-mail de membro direto)."""

    member_id: str
    display_name: str
    avatar_url: str = ""


@dataclass
class ChatSpace:
    """Um espaço do Google Chat — DM 1:1 ou grupo nomeado."""

    space_id: str
    display_name: str
    is_group: bool  # False = DM 1:1, True = espaço com nome/vários membros
    members: list[ChatMember] = field(default_factory=list)
    last_message_preview: str = ""
    last_message_at: datetime | None = None


@dataclass
class ChatMessage:
    """Uma mensagem dentro de um espaço."""

    message_id: str
    space_id: str
    sender_id: str
    sender_name: str
    text: str
    created_at: datetime
    sender_avatar_url: str = ""
    is_own: bool = False
