"""Ferramentas do Copiloto agêntico.

Duas categorias:

* **Leitura** (`READ_TOOLS`) — executadas livremente dentro do loop da IA para
  ela conhecer projetos, transcrições, board e sprints antes de responder.
* **Escrita** — a IA nunca grava direto. Ela chama `propose_actions`, cujas
  ações voltam ao cliente como *pending_actions* para preview + confirmação.
  Só depois de o usuário confirmar é que `AgentTools.execute_write` roda.

Todas as operações reaproveitam os casos de uso do contexto `projects`, então
as regras de negócio e o controle de acesso ao workspace ficam num lugar só.
"""
from __future__ import annotations

from datetime import date

from contexts.projects.application.use_cases.create_card import CreateCard
from contexts.projects.application.use_cases.create_sprint import CreateSprint
from contexts.projects.application.use_cases.list_cards import ListCards
from contexts.projects.application.use_cases.list_projects import ListProjects
from contexts.projects.application.use_cases.list_sprints import ListSprints
from contexts.projects.application.use_cases.update_card import UpdateCard
from contexts.projects.application.use_cases.update_sprint import UpdateSprint
from contexts.projects.domain.entities.card import Card
from contexts.projects.domain.entities.sprint import Sprint
from contexts.projects.infrastructure.django.repositories_impl import (
    DjangoCardRepository,
    DjangoHistoryRepository,
    DjangoProjectRepository,
    DjangoSprintRepository,
    DjangoWorkspaceAccess,
)
from contexts.copilot.infrastructure.django.repositories_impl import (
    DjangoDocumentRepository,
)
from shared.domain.errors import ValidationError

# ── Especificação das ferramentas (formato neutro de provedor) ───────────────
# Cada item: {name, description, input_schema}. Convertido para o formato da
# Anthropic (tools) ou OpenAI (functions) na camada de cada provedor.

_ENUM_PRIORITY = ["low", "medium", "high", "urgent"]
_ENUM_TYPE = ["feature", "bug", "debt", "spike", "chore"]
_ENUM_STATUS = ["backlog", "todo", "doing", "review", "done"]

READ_TOOLS: list[dict] = [
    {
        "name": "list_projects",
        "description": "Lista os projetos do workspace (id, chave, nome). Use para "
        "descobrir em qual projeto criar cards ou consultar o board.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "list_documents",
        "description": "Lista documentos e transcrições importados no workspace "
        "(reuniões, atas, specs). Retorna id, título e tipo.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "read_document",
        "description": "Lê o texto completo de um documento/transcrição pelo id. "
        "Use para extrair tarefas, decisões e riscos de uma reunião.",
        "input_schema": {
            "type": "object",
            "properties": {"document_id": {"type": "string"}},
            "required": ["document_id"],
        },
    },
    {
        "name": "list_sprints",
        "description": "Lista as sprints de um projeto (id, nome, status, datas).",
        "input_schema": {
            "type": "object",
            "properties": {"project_id": {"type": "string"}},
            "required": ["project_id"],
        },
    },
    {
        "name": "board_summary",
        "description": "Resumo do board de um projeto: contagem de cards por coluna, "
        "pontos por status e sprint ativa. Use para dar um norte ('o que priorizar').",
        "input_schema": {
            "type": "object",
            "properties": {"project_id": {"type": "string"}},
            "required": ["project_id"],
        },
    },
    {
        "name": "list_cards",
        "description": "Lista cards de um projeto (id, ref, título, status, "
        "prioridade, pontos, sprint). Filtra por sprint_id opcional.",
        "input_schema": {
            "type": "object",
            "properties": {
                "project_id": {"type": "string"},
                "sprint_id": {"type": "string"},
            },
            "required": ["project_id"],
        },
    },
]

# Schema de uma única ação de escrita proposta.
_ACTION_SCHEMA = {
    "type": "object",
    "properties": {
        "action": {
            "type": "string",
            "enum": [
                "create_card",
                "update_card",
                "create_sprint",
                "update_sprint",
            ],
        },
        "reason": {
            "type": "string",
            "description": "Justificativa curta da ação (mostrada ao usuário).",
        },
        # create_card / update_card
        "project_id": {"type": "string"},
        "card_id": {"type": "string"},
        "title": {"type": "string"},
        "description": {"type": "string"},
        "priority": {"type": "string", "enum": _ENUM_PRIORITY},
        "type": {"type": "string", "enum": _ENUM_TYPE},
        "status": {
            "type": "string",
            "enum": _ENUM_STATUS,
            "description": "Coluna do card. Ao CRIAR card novo, omita ou use 'todo' "
            "para ele aparecer no Quadro. Use 'backlog' apenas se o usuário pedir.",
        },
        "points": {"type": "integer"},
        "sprint_id": {"type": "string"},
        # create_sprint / update_sprint
        "sprint_name": {"type": "string"},
        "goal": {"type": "string"},
        "start_date": {"type": "string", "description": "YYYY-MM-DD"},
        "end_date": {"type": "string", "description": "YYYY-MM-DD"},
    },
    "required": ["action", "reason"],
}

PROPOSE_TOOL: dict = {
    "name": "propose_actions",
    "description": (
        "Proponha ações de escrita (criar/editar cards, criar/editar sprints) "
        "para o usuário aprovar. NÃO executa nada: as ações voltam como preview "
        "para confirmação. Chame quando o usuário pedir para criar/alterar algo. "
        "Sempre inclua uma 'reason' clara em cada ação."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "actions": {"type": "array", "items": _ACTION_SCHEMA},
        },
        "required": ["actions"],
    },
}

ALL_TOOLS: list[dict] = [*READ_TOOLS, PROPOSE_TOOL]

WRITE_ACTIONS = {"create_card", "update_card", "create_sprint", "update_sprint"}


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    return date.fromisoformat(value)


class AgentTools:
    """Executa as ferramentas do agente para um (workspace, ator) fixo.

    Reutiliza os repositórios e casos de uso de `projects`; o controle de acesso
    é feito pelos próprios casos de uso via `WorkspaceAccess`.
    """

    def __init__(self, *, workspace_id: str, actor_id: str):
        self.workspace_id = workspace_id
        self.actor_id = actor_id
        self._projects = DjangoProjectRepository()
        self._cards = DjangoCardRepository()
        self._sprints = DjangoSprintRepository()
        self._history = DjangoHistoryRepository()
        self._access = DjangoWorkspaceAccess()
        self._docs = DjangoDocumentRepository()

    # ── Leitura (executada dentro do loop da IA) ─────────────────────────────
    def execute_read(self, name: str, args: dict) -> dict:
        handler = getattr(self, f"_read_{name}", None)
        if handler is None:
            return {"error": f"Ferramenta desconhecida: {name}"}
        try:
            return handler(args or {})
        except Exception as exc:  # noqa: BLE001 — erro vira contexto p/ a IA, não 500
            return {"error": str(exc)}

    def _assert_member(self) -> None:
        if not self._access.is_member(
            workspace_id=self.workspace_id, user_id=self.actor_id
        ):
            raise ValidationError("Sem acesso a este workspace.")

    def _project_or_raise(self, ref: str):
        """Resolve um projeto por UUID, chave ('T4E') **ou** nome ('AAAA').

        A IA refere o projeto de formas variadas (nome que o usuário digitou,
        chave que viu em `list_projects` ou o UUID) — aceitamos todas para não
        falhar a criação. Nome/chave são comparados sem diferenciar maiúsculas.
        """
        project = None
        try:
            project = self._projects.get(project_id=ref)
        except Exception:  # noqa: BLE001 — ref não-UUID cai na busca textual
            project = None
        if project is None:
            ref_norm = (ref or "").strip().lower()
            candidates = self._projects.list_by_workspace(workspace_id=self.workspace_id)
            # Prioridade: UUID exato > chave exata > nome exato.
            project = (
                next((p for p in candidates if str(p.id) == ref), None)
                or next((p for p in candidates if p.key.lower() == ref_norm), None)
                or next((p for p in candidates if p.name.strip().lower() == ref_norm), None)
            )
        if project is None or project.workspace_id != self.workspace_id:
            available = ", ".join(
                f"{p.name} ({p.key})"
                for p in self._projects.list_by_workspace(workspace_id=self.workspace_id)
            )
            raise ValidationError(
                f"Projeto '{ref}' não encontrado. Projetos disponíveis: {available or 'nenhum'}."
            )
        return project

    def _read_list_projects(self, _args: dict) -> dict:
        self._assert_member()
        projects = ListProjects(self._projects, self._access).execute(
            workspace_id=self.workspace_id, actor_id=self.actor_id
        )
        return {
            "projects": [
                {"id": p.id, "key": p.key, "name": p.name} for p in projects
            ]
        }

    def _read_list_documents(self, _args: dict) -> dict:
        self._assert_member()
        docs = self._docs.list_by_workspace(workspace_id=self.workspace_id)
        return {
            "documents": [
                {
                    "id": d.id,
                    "title": d.title,
                    "kind": d.kind.value,
                    "status": d.status.value,
                }
                for d in docs
            ]
        }

    def _read_read_document(self, args: dict) -> dict:
        self._assert_member()
        doc = self._docs.get(document_id=args["document_id"])
        if doc is None or doc.workspace_id != self.workspace_id:
            raise ValidationError("Documento não encontrado neste workspace.")
        return {"title": doc.title, "text": doc.text[:60_000]}

    def _read_list_sprints(self, args: dict) -> dict:
        project = self._project_or_raise(args["project_id"])
        sprints = ListSprints(self._projects, self._sprints, self._access).execute(
            project_id=str(project.id), actor_id=self.actor_id
        )
        return {"sprints": [self._sprint_dict(s) for s in sprints]}

    def _read_list_cards(self, args: dict) -> dict:
        project = self._project_or_raise(args["project_id"])
        cards = ListCards(self._projects, self._cards, self._access).execute(
            project_id=str(project.id), actor_id=self.actor_id
        )
        sprint_id = args.get("sprint_id")
        if sprint_id:
            cards = [c for c in cards if c.sprint_id == sprint_id]
        return {"cards": [self._card_dict(c, project.key) for c in cards]}

    def _read_board_summary(self, args: dict) -> dict:
        project = self._project_or_raise(args["project_id"])
        cards = ListCards(self._projects, self._cards, self._access).execute(
            project_id=str(project.id), actor_id=self.actor_id
        )
        sprints = ListSprints(self._projects, self._sprints, self._access).execute(
            project_id=str(project.id), actor_id=self.actor_id
        )
        active = next((s for s in sprints if s.status.value == "active"), None)
        by_status: dict[str, dict] = {}
        for c in cards:
            bucket = by_status.setdefault(
                c.status.value, {"count": 0, "points": 0}
            )
            bucket["count"] += 1
            bucket["points"] += c.points or 0
        return {
            "project": {"id": project.id, "key": project.key, "name": project.name},
            "total_cards": len(cards),
            "by_status": by_status,
            "active_sprint": self._sprint_dict(active) if active else None,
        }

    @staticmethod
    def _card_dict(c: Card, project_key: str) -> dict:
        return {
            "id": c.id,
            "ref": f"{project_key}-{c.number}",
            "title": c.title,
            "status": c.status.value,
            "type": c.type.value,
            "priority": c.priority.value,
            "points": c.points,
            "sprint_id": c.sprint_id,
            "assignee_id": c.assignee_id,
        }

    @staticmethod
    def _sprint_dict(s: Sprint) -> dict:
        return {
            "id": s.id,
            "name": s.name,
            "status": s.status.value,
            "goal": s.goal,
            "start_date": s.start_date.isoformat() if s.start_date else None,
            "end_date": s.end_date.isoformat() if s.end_date else None,
        }

    # ── Escrita (só após confirmação do usuário) ─────────────────────────────
    def execute_write(self, action: dict) -> dict:
        kind = action.get("action")
        if kind not in WRITE_ACTIONS:
            return {"ok": False, "error": f"Ação inválida: {kind}"}
        handler = getattr(self, f"_write_{kind}")
        try:
            return {"ok": True, **handler(action)}
        except Exception as exc:  # noqa: BLE001 — reportado por-ação ao cliente
            return {"ok": False, "action": kind, "error": str(exc)}

    def _write_create_card(self, a: dict) -> dict:
        project = self._project_or_raise(a["project_id"])
        # Cards novos entram em 'todo' para aparecerem no Quadro. O status
        # 'backlog' não é uma coluna do workflow, então seria invisível — nunca
        # criamos direto no backlog (o usuário move depois se quiser).
        status = a.get("status") or "todo"
        if status == "backlog":
            status = "todo"
        card = CreateCard(self._projects, self._cards, self._access).execute(
            project_id=str(project.id),
            actor_id=self.actor_id,
            title=a["title"],
            description=a.get("description", ""),
            priority=a.get("priority", "medium"),
            type=a.get("type", "feature"),
            status=status,
            source="copilot",
        )
        ref = f"{project.key}-{card.number}"
        # Campos extra (pontos, sprint) via update, se informados.
        extra = {k: a[k] for k in ("points", "sprint_id") if k in a}
        if extra:
            UpdateCard(
                self._projects, self._cards, self._access, self._history
            ).execute(card_id=str(card.id), actor_id=self.actor_id, **extra)
        return {
            "action": "create_card",
            "id": str(card.id),
            "ref": ref,
            "title": card.title,
            "status": status,
        }

    def _resolve_card_id(self, ref: str) -> str:
        """Aceita UUID ou ref legível (ex.: 'T4E-12') e devolve o UUID do card."""
        try:
            if self._cards.get(card_id=ref) is not None:
                return ref
        except Exception:  # noqa: BLE001 — ref não-UUID cai no parsing por chave
            pass
        if "-" in (ref or ""):
            key, _, num = ref.rpartition("-")
            if num.isdigit():
                project = self._project_or_raise(key)
                for c in self._cards.list_by_project(project_id=str(project.id)):
                    if c.number == int(num):
                        return str(c.id)
        raise ValidationError(f"Card '{ref}' não encontrado.")

    def _write_update_card(self, a: dict) -> dict:
        fields = {
            k: a[k]
            for k in (
                "title",
                "description",
                "status",
                "type",
                "priority",
                "points",
                "sprint_id",
            )
            if k in a
        }
        card_id = self._resolve_card_id(a["card_id"])
        card = UpdateCard(
            self._projects, self._cards, self._access, self._history
        ).execute(card_id=card_id, actor_id=self.actor_id, **fields)
        return {"action": "update_card", "id": str(card.id), "title": card.title}

    def _write_create_sprint(self, a: dict) -> dict:
        project = self._project_or_raise(a["project_id"])
        sprint = CreateSprint(self._projects, self._sprints, self._access).execute(
            project_id=str(project.id),
            name=a["sprint_name"],
            actor_id=self.actor_id,
            goal=a.get("goal", ""),
            start_date=_parse_date(a.get("start_date")),
            end_date=_parse_date(a.get("end_date")),
        )
        return {"action": "create_sprint", "id": str(sprint.id), "name": sprint.name}

    def _write_update_sprint(self, a: dict) -> dict:
        fields: dict = {}
        if "sprint_name" in a:
            fields["name"] = a["sprint_name"]
        if "goal" in a:
            fields["goal"] = a["goal"]
        if "status" in a:
            fields["status"] = a["status"]
        if "start_date" in a:
            fields["start_date"] = _parse_date(a.get("start_date"))
        if "end_date" in a:
            fields["end_date"] = _parse_date(a.get("end_date"))
        sprint = UpdateSprint(
            self._projects, self._sprints, self._access, self._cards
        ).execute(sprint_id=a["sprint_id"], actor_id=self.actor_id, **fields)
        return {"action": "update_sprint", "id": str(sprint.id), "name": sprint.name}
