"""Implementação do ChatGateway usando a Google Chat API (auth de usuário)."""
from datetime import UTC, datetime

import requests
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from contexts.google.domain.entities.chat import ChatMember, ChatMessage, ChatSpace
from contexts.google.domain.ports.chat_gateway import ChatError, ChatGateway

_USERINFO_URI = "https://www.googleapis.com/oauth2/v3/userinfo"


def _parse_dt(value: str | None) -> datetime:
    if not value:
        return datetime.now(UTC)
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    dt = datetime.fromisoformat(value)
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


class GoogleChatGateway(ChatGateway):
    """Operações no Google Chat via google-api-python-client."""

    @staticmethod
    def _service(access_token: str):
        creds = Credentials(token=access_token)
        return build("chat", "v1", credentials=creds, cache_discovery=False)

    @staticmethod
    def _whoami(access_token: str) -> str:
        """ID numérico da conta do usuário (`sub`) — mesmo id usado no recurso
        `users/{id}` do Chat, é como a UI decide "essa mensagem é minha"."""
        try:
            resp = requests.get(
                _USERINFO_URI, headers={"Authorization": f"Bearer {access_token}"}, timeout=10
            )
            if resp.ok:
                return resp.json().get("sub", "")
        except requests.RequestException:
            pass
        return ""

    @staticmethod
    def _resolve_names(access_token: str, user_ids: list[str]) -> dict[str, tuple[str, str]]:
        """Resolve `users/{id}` -> (nome, foto) pela People API.

        Existe porque `spaces.members.list()` do Chat devolve só `{name, type}`
        do membro — confirmado em produção, nunca `displayName`/`avatarUrl`.
        Best-effort: contas que conectaram o Google antes do escopo
        `people.readonly` existir não têm esse escopo até reconectar; nesse
        caso a chamada falha e quem chama mantém o fallback "Alguém".
        """
        if not user_ids:
            return {}
        creds = Credentials(token=access_token)
        people_service = build("people", "v1", credentials=creds, cache_discovery=False)
        resource_names = [uid.replace("users/", "people/", 1) for uid in user_ids]
        try:
            result = (
                people_service.people()
                .getBatchGet(resourceNames=resource_names, personFields="names,photos")
                .execute()
            )
        except HttpError:
            return {}

        resolved: dict[str, tuple[str, str]] = {}
        for r in result.get("responses", []):
            person = r.get("person")
            if not person:
                continue
            user_id = r.get("requestedResourceName", "").replace("people/", "users/", 1)
            names = person.get("names", [])
            photos = person.get("photos", [])
            display_name = (names[0].get("displayName", "") if names else "").strip()
            if display_name:
                resolved[user_id] = (display_name, photos[0].get("url", "") if photos else "")
        return resolved

    def _members_of(self, access_token: str, service, space_name: str) -> list[ChatMember]:
        # Best-effort: um espaço sem permissão de listar membros não deve
        # derrubar a listagem inteira — só fica sem nome de exibição.
        try:
            result = service.spaces().members().list(parent=space_name, pageSize=25).execute()
        except HttpError:
            return []

        raw = [m.get("member", {}) for m in result.get("memberships", [])]
        missing_ids = [
            u.get("name", "") for u in raw if not u.get("displayName") and u.get("name")
        ]
        resolved = self._resolve_names(access_token, missing_ids)

        members: list[ChatMember] = []
        for user in raw:
            user_id = user.get("name", "")
            display_name = user.get("displayName", "").strip()
            avatar_url = user.get("avatarUrl", "")
            if not display_name and user_id in resolved:
                display_name, people_avatar = resolved[user_id]
                avatar_url = avatar_url or people_avatar
            members.append(
                ChatMember(
                    member_id=user_id,
                    display_name=display_name or "Alguém",
                    avatar_url=avatar_url,
                )
            )
        return members

    def list_spaces(self, *, access_token: str) -> list[ChatSpace]:
        try:
            service = self._service(access_token)
            result = service.spaces().list(pageSize=100).execute()
        except HttpError as exc:
            raise ChatError(f"Erro ao listar espaços do Chat: {exc}") from exc

        spaces: list[ChatSpace] = []
        for item in result.get("spaces", []):
            space_type = item.get("spaceType", "")
            is_group = space_type != "DIRECT_MESSAGE"
            members = self._members_of(access_token, service, item["name"])
            display_name = item.get("displayName", "").strip()
            if not display_name:
                # DM sem nome — usa o nome do outro participante.
                display_name = ", ".join(m.display_name for m in members) or "Conversa"
            spaces.append(
                ChatSpace(
                    space_id=item["name"],
                    display_name=display_name,
                    is_group=is_group,
                    members=members,
                )
            )
        return spaces

    def list_messages(
        self, *, access_token: str, space_id: str, page_size: int = 50
    ) -> list[ChatMessage]:
        try:
            service = self._service(access_token)
            result = (
                service.spaces()
                .messages()
                .list(parent=space_id, pageSize=page_size, orderBy="createTime desc")
                .execute()
            )
        except HttpError as exc:
            raise ChatError(f"Erro ao listar mensagens: {exc}") from exc

        me = f"users/{self._whoami(access_token)}"
        # `messages.list` só devolve o resource id do remetente (`users/123`),
        # nunca displayName/avatar — isso só vem por `members.list`. Sem este
        # mapa toda mensagem cai no fallback "Alguém".
        members_by_id = {m.member_id: m for m in self._members_of(access_token, service, space_id)}

        messages = []
        for item in result.get("messages", []):
            if not item.get("text"):
                continue
            sender = item.get("sender", {})
            sender_id = sender.get("name", "")
            member = members_by_id.get(sender_id)
            messages.append(
                ChatMessage(
                    message_id=item["name"],
                    space_id=space_id,
                    sender_id=sender_id,
                    sender_name=sender.get("displayName", "").strip()
                    or (member.display_name if member else "Alguém"),
                    sender_avatar_url=sender.get("avatarUrl", "")
                    or (member.avatar_url if member else ""),
                    text=item.get("text", ""),
                    created_at=_parse_dt(item.get("createTime")),
                    is_own=sender_id == me,
                )
            )
        # A API devolve mais recente primeiro; a UI de chat quer cronológico.
        messages.reverse()
        return messages

    def send_message(self, *, access_token: str, space_id: str, text: str) -> ChatMessage:
        try:
            service = self._service(access_token)
            item = (
                service.spaces()
                .messages()
                .create(parent=space_id, body={"text": text})
                .execute()
            )
        except HttpError as exc:
            raise ChatError(f"Erro ao enviar mensagem: {exc}") from exc

        return ChatMessage(
            message_id=item["name"],
            space_id=space_id,
            sender_id=item.get("sender", {}).get("name", ""),
            sender_name=item.get("sender", {}).get("displayName", "").strip() or "Você",
            sender_avatar_url=item.get("sender", {}).get("avatarUrl", ""),
            text=item.get("text", text),
            created_at=_parse_dt(item.get("createTime")),
            is_own=True,
        )

    def create_dm(self, *, access_token: str, member_email: str) -> ChatSpace:
        try:
            service = self._service(access_token)
            item = (
                service.spaces()
                .setup(
                    body={
                        "space": {"spaceType": "DIRECT_MESSAGE"},
                        "memberships": [
                            {"member": {"name": f"users/{member_email}", "type": "HUMAN"}}
                        ],
                    }
                )
                .execute()
            )
        except HttpError as exc:
            raise ChatError(f"Erro ao criar conversa: {exc}") from exc

        space_name = item["name"]
        service = self._service(access_token)
        members = self._members_of(access_token, service, space_name)
        display_name = ", ".join(m.display_name for m in members) or member_email
        return ChatSpace(
            space_id=space_name,
            display_name=display_name,
            is_group=False,
            members=members,
        )
