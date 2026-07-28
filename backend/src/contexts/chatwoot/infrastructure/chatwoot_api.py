"""Cliente HTTP da Application API do Chatwoot.

Doc: https://developers.chatwoot.com/api-reference — todas as rotas daqui
vivem sob ``{base_url}/api/v1/accounts/{account_id}`` e autenticam pelo header
``api_access_token``.

Traduzimos os erros de transporte para erros de domínio logo na borda:
* 401/403 → PermissionDeniedError (token inválido ou sem escopo)
* 404     → NotFoundError
* resto   → UpstreamError (o Chatwoot caiu, não o usuário errou)
"""
from __future__ import annotations

import httpx

from contexts.chatwoot.domain.entities.catalog import (
    Agent,
    CannedResponse,
    ChatContact,
    CustomAttributeDefinition,
    Inbox,
    Label,
    Team,
)
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

TIMEOUT = httpx.Timeout(20.0, connect=10.0)


def _unwrap(payload):
    """Desembrulha as duas formas que a API usa: ``{payload: […]}`` e lista crua."""
    if isinstance(payload, dict):
        return payload.get("payload", payload.get("data", []))
    return payload or []


class ChatwootHttpGateway:
    """Implementação real do `ChatwootGateway` sobre httpx."""

    def __init__(self, *, base_url: str, account_id: int, access_token: str):
        self._base = f"{base_url.rstrip('/')}/api/v1/accounts/{account_id}"
        self._root = base_url.rstrip("/")
        self._headers = {
            "api_access_token": access_token,
            "Content-Type": "application/json",
        }

    # ── Transporte ───────────────────────────────────────────────────────────
    def _request(self, method: str, path: str, *, root: bool = False, **kwargs):
        url = f"{self._root if root else self._base}{path}"
        try:
            resp = httpx.request(method, url, headers=self._headers, timeout=TIMEOUT, **kwargs)
        except httpx.HTTPError as exc:  # DNS, timeout, TLS…
            raise UpstreamError(f"Não foi possível falar com o Chatwoot: {exc}") from exc

        if resp.status_code in (401, 403):
            raise PermissionDeniedError(
                "O Chatwoot recusou o token de acesso. Verifique o api_access_token."
            )
        if resp.status_code == 404:
            raise NotFoundError("Recurso não encontrado no Chatwoot.")
        if resp.status_code == 422:
            raise ValidationError(f"O Chatwoot recusou os dados enviados: {resp.text[:200]}")
        if resp.status_code >= 400:
            raise UpstreamError(f"Chatwoot respondeu {resp.status_code}: {resp.text[:200]}")

        if not resp.content:
            return {}
        try:
            return resp.json()
        except ValueError as exc:
            raise UpstreamError("O Chatwoot devolveu uma resposta não-JSON.") from exc

    def _get(self, path: str, **params):
        # httpx omite None, mas listas precisam virar `labels[]=a&labels[]=b`.
        clean = {k: v for k, v in params.items() if v is not None}
        return self._request("GET", path, params=clean)

    def _post(self, path: str, json: dict | None = None, **params):
        clean = {k: v for k, v in params.items() if v is not None}
        return self._request("POST", path, json=json or {}, params=clean)

    def _patch(self, path: str, json: dict):
        return self._request("PATCH", path, json=json)

    def _put(self, path: str, json: dict):
        return self._request("PUT", path, json=json)

    def _delete(self, path: str):
        return self._request("DELETE", path)

    # ── Identidade / saúde ───────────────────────────────────────────────────
    def verify(self) -> dict:
        """Bate no perfil do dono do token: valida credencial e identifica o agente."""
        return self._request("GET", "/api/v1/profile", root=True)

    # ── Conversas ────────────────────────────────────────────────────────────
    def list_conversations(
        self,
        *,
        status: str | None = None,
        assignee_type: str | None = None,
        inbox_id: int | None = None,
        team_id: int | None = None,
        labels: list[str] | None = None,
        query: str | None = None,
        page: int = 1,
    ) -> ConversationPage:
        params: dict = {
            "status": status,
            "assignee_type": assignee_type,
            "inbox_id": inbox_id,
            "team_id": team_id,
            "q": query,
            "page": page,
        }
        if labels:
            params["labels[]"] = labels
        return ConversationPage.from_api(self._get("/conversations", **params))

    def filter_conversations(self, payload: list[dict], *, page: int = 1) -> ConversationPage:
        raw = self._post("/conversations/filter", {"payload": payload}, page=page)
        return ConversationPage.from_api(raw)

    def get_conversation(self, conversation_id: int) -> Conversation:
        return Conversation.from_api(self._get(f"/conversations/{conversation_id}"))

    def conversation_counts(self) -> dict:
        raw = self._get("/conversations/meta")
        meta = raw.get("meta", raw) if isinstance(raw, dict) else {}
        return {
            "mine_count": int(meta.get("mine_count") or 0),
            "unassigned_count": int(meta.get("unassigned_count") or 0),
            "assigned_count": int(meta.get("assigned_count") or 0),
            "all_count": int(meta.get("all_count") or 0),
        }

    def toggle_status(
        self, conversation_id: int, *, status: str, snoozed_until: str | None = None
    ) -> dict:
        body: dict = {"status": status}
        if snoozed_until:
            body["snoozed_until"] = snoozed_until
        return self._post(f"/conversations/{conversation_id}/toggle_status", body)

    def toggle_priority(self, conversation_id: int, *, priority: str | None) -> dict:
        # `priority: null` limpa a prioridade — por isso não usamos `or ""`.
        return self._post(f"/conversations/{conversation_id}/toggle_priority", {"priority": priority})

    def assign_conversation(
        self, conversation_id: int, *, assignee_id: int | None = None, team_id: int | None = None
    ) -> dict:
        body: dict = {}
        if assignee_id is not None:
            body["assignee_id"] = assignee_id
        elif team_id is not None:
            body["team_id"] = team_id
        else:
            # Sem nenhum dos dois o Chatwoot desatribui — é o "remover responsável".
            body["assignee_id"] = None
        return self._post(f"/conversations/{conversation_id}/assignments", body)

    def update_conversation_labels(self, conversation_id: int, labels: list[str]) -> list[str]:
        raw = self._post(f"/conversations/{conversation_id}/labels", {"labels": labels})
        return list(_unwrap(raw) or labels)

    def update_custom_attributes(self, conversation_id: int, attributes: dict) -> dict:
        raw = self._post(
            f"/conversations/{conversation_id}/custom_attributes",
            {"custom_attributes": attributes},
        )
        return raw.get("custom_attributes", attributes) if isinstance(raw, dict) else attributes

    def mute_conversation(self, conversation_id: int) -> dict:
        return self._post(f"/conversations/{conversation_id}/mute")

    def unmute_conversation(self, conversation_id: int) -> dict:
        return self._post(f"/conversations/{conversation_id}/unmute")

    # ── Mensagens ────────────────────────────────────────────────────────────
    def list_messages(self, conversation_id: int, *, before: int | None = None) -> list[Message]:
        raw = self._get(f"/conversations/{conversation_id}/messages", before=before)
        return [
            Message.from_api(m, conversation_id=conversation_id) for m in (_unwrap(raw) or [])
        ]

    def send_message(
        self,
        conversation_id: int,
        *,
        content: str,
        private: bool = False,
        content_type: str = "text",
        content_attributes: dict | None = None,
        template_params: dict | None = None,
    ) -> Message:
        body: dict = {
            "content": content,
            "message_type": "outgoing",
            "private": private,
        }
        if content_type and content_type != "text":
            body["content_type"] = content_type
        if content_attributes:
            body["content_attributes"] = content_attributes
        if template_params:
            body["template_params"] = template_params
        raw = self._post(f"/conversations/{conversation_id}/messages", body)
        return Message.from_api(raw, conversation_id=conversation_id)

    def delete_message(self, conversation_id: int, message_id: int) -> None:
        self._delete(f"/conversations/{conversation_id}/messages/{message_id}")

    def toggle_typing(self, conversation_id: int, *, typing_on: bool) -> None:
        self._post(
            f"/conversations/{conversation_id}/toggle_typing_status",
            {"typing_status": "on" if typing_on else "off"},
        )

    def mark_seen(self, conversation_id: int) -> None:
        self._post(f"/conversations/{conversation_id}/update_last_seen")

    # ── Contatos ─────────────────────────────────────────────────────────────
    def list_contacts(self, *, page: int = 1, sort: str | None = None) -> list[ChatContact]:
        raw = self._get("/contacts", page=page, sort=sort)
        return [ChatContact.from_api(c) for c in (_unwrap(raw) or [])]

    def search_contacts(self, query: str, *, page: int = 1) -> list[ChatContact]:
        raw = self._get("/contacts/search", q=query, page=page)
        return [ChatContact.from_api(c) for c in (_unwrap(raw) or [])]

    def get_contact(self, contact_id: int) -> ChatContact:
        raw = self._get(f"/contacts/{contact_id}")
        return ChatContact.from_api(_unwrap(raw) if isinstance(raw, dict) else raw)

    def create_contact(self, payload: dict) -> ChatContact:
        raw = self._post("/contacts", payload)
        return ChatContact.from_api(_unwrap(raw) if isinstance(raw, dict) else raw)

    def update_contact(self, contact_id: int, payload: dict) -> ChatContact:
        raw = self._put(f"/contacts/{contact_id}", payload)
        return ChatContact.from_api(_unwrap(raw) if isinstance(raw, dict) else raw)

    def contact_conversations(self, contact_id: int) -> list[Conversation]:
        raw = self._get(f"/contacts/{contact_id}/conversations")
        return [Conversation.from_api(c) for c in (_unwrap(raw) or [])]

    # ── Catálogos ────────────────────────────────────────────────────────────
    def list_inboxes(self) -> list[Inbox]:
        return [Inbox.from_api(i) for i in (_unwrap(self._get("/inboxes")) or [])]

    def list_agents(self) -> list[Agent]:
        raw = self._get("/agents")
        return [Agent.from_api(a) for a in (raw if isinstance(raw, list) else _unwrap(raw) or [])]

    def list_teams(self) -> list[Team]:
        raw = self._get("/teams")
        return [Team.from_api(t) for t in (raw if isinstance(raw, list) else _unwrap(raw) or [])]

    def list_labels(self) -> list[Label]:
        return [Label.from_api(x) for x in (_unwrap(self._get("/labels")) or [])]

    def list_canned_responses(self) -> list[CannedResponse]:
        raw = self._get("/canned_responses")
        items = raw if isinstance(raw, list) else _unwrap(raw) or []
        return [CannedResponse.from_api(c) for c in items]

    def list_custom_attribute_definitions(
        self, *, model: int | None = None
    ) -> list[CustomAttributeDefinition]:
        raw = self._get("/custom_attribute_definitions", attribute_model=model)
        items = raw if isinstance(raw, list) else _unwrap(raw) or []
        return [CustomAttributeDefinition.from_api(c) for c in items]

    # ── Relatórios ───────────────────────────────────────────────────────────
    def reports_summary(self, *, since: str, until: str) -> dict:
        raw = self._get("/reports/summary", type="account", since=since, until=until)
        return raw if isinstance(raw, dict) else {}
