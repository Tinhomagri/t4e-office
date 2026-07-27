"""Ferramentas de entrega: projetos, boards, sprints, cards e transcrições.

Domínio histórico do Copiloto. As ferramentas de leitura mantêm os nomes sem
prefixo (`list_projects`, `board_summary`…) porque já estão no vocabulário do
modelo e nos testes; domínios novos usam prefixo (`sales_*`, `mkt_*`).
"""
from __future__ import annotations

from contexts.copilot.infrastructure.agent.base import parse_date, tool
from contexts.copilot.infrastructure.django.repositories_impl import (
    DjangoDocumentRepository,
)
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
from shared.domain.errors import ValidationError

ENUM_PRIORITY = ["low", "medium", "high", "urgent"]
ENUM_TYPE = [
    "feature", "bug", "debt", "spike", "chore",
    # marketing
    "post", "peca", "campanha", "artigo", "email",
]
ENUM_STATUS = [
    "backlog", "todo", "doing", "review", "done",
    # fluxo marketing
    "briefing", "criacao", "aprovacao", "agendado", "publicado",
]
ENUM_CHANNEL = [
    "instagram", "facebook", "linkedin", "tiktok",
    "youtube", "blog", "email", "site",
]


class ProjectsProvider:
    """Leitura e escrita do contexto `projects` para o agente."""

    domain = "projects"

    def __init__(self, *, workspace_id: str, actor_id: str):
        self.workspace_id = workspace_id
        self.actor_id = actor_id
        self._projects = DjangoProjectRepository()
        self._cards = DjangoCardRepository()
        self._sprints = DjangoSprintRepository()
        self._history = DjangoHistoryRepository()
        self._access = DjangoWorkspaceAccess()
        self._docs = DjangoDocumentRepository()

    # ── Leitura ──────────────────────────────────────────────────────────────
    def read_tools(self) -> list[dict]:
        return [
            tool(
                "list_projects",
                "Lista os projetos do workspace (id, chave, nome). Use para "
                "descobrir em qual projeto criar cards ou consultar o board.",
            ),
            tool(
                "list_documents",
                "Lista documentos e transcrições importados no workspace "
                "(reuniões, atas, specs). Retorna id, título e tipo.",
            ),
            tool(
                "read_document",
                "Lê o texto completo de um documento/transcrição pelo id. "
                "Use para extrair tarefas, decisões e riscos de uma reunião.",
                {"document_id": {"type": "string"}},
                ["document_id"],
            ),
            tool(
                "list_sprints",
                "Lista as sprints de um projeto (id, nome, status, datas).",
                {"project_id": {"type": "string"}},
                ["project_id"],
            ),
            tool(
                "board_summary",
                "Resumo do board de um projeto: contagem de cards por coluna, "
                "pontos por status e sprint ativa. Use para dar um norte "
                "('o que priorizar').",
                {"project_id": {"type": "string"}},
                ["project_id"],
            ),
            tool(
                "list_cards",
                "Lista cards de um projeto (id, ref, título, status, prioridade, "
                "pontos, sprint). Filtra por sprint_id opcional.",
                {
                    "project_id": {"type": "string"},
                    "sprint_id": {"type": "string"},
                },
                ["project_id"],
            ),
        ]

    def execute_read(self, name: str, args: dict) -> dict:
        handler = getattr(self, f"_read_{name}", None)
        if handler is None:
            raise ValidationError(f"Ferramenta desconhecida: {name}")
        return handler(args or {})

    def project_or_raise(self, ref: str):
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
            candidates = self._projects.list_by_workspace(
                workspace_id=self.workspace_id
            )
            # Prioridade: UUID exato > chave exata > nome exato.
            project = (
                next((p for p in candidates if str(p.id) == ref), None)
                or next((p for p in candidates if p.key.lower() == ref_norm), None)
                or next(
                    (p for p in candidates if p.name.strip().lower() == ref_norm),
                    None,
                )
            )
        if project is None or project.workspace_id != self.workspace_id:
            available = ", ".join(
                f"{p.name} ({p.key})"
                for p in self._projects.list_by_workspace(
                    workspace_id=self.workspace_id
                )
            )
            raise ValidationError(
                f"Projeto '{ref}' não encontrado. "
                f"Projetos disponíveis: {available or 'nenhum'}."
            )
        return project

    def _read_list_projects(self, _args: dict) -> dict:
        projects = ListProjects(self._projects, self._access).execute(
            workspace_id=self.workspace_id, actor_id=self.actor_id
        )
        return {
            "projects": [{"id": p.id, "key": p.key, "name": p.name} for p in projects]
        }

    def _read_list_documents(self, _args: dict) -> dict:
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
        doc = self._docs.get(document_id=args["document_id"])
        if doc is None or doc.workspace_id != self.workspace_id:
            raise ValidationError("Documento não encontrado neste workspace.")
        return {"title": doc.title, "text": doc.text[:60_000]}

    def _read_list_sprints(self, args: dict) -> dict:
        project = self.project_or_raise(args["project_id"])
        sprints = ListSprints(self._projects, self._sprints, self._access).execute(
            project_id=str(project.id), actor_id=self.actor_id
        )
        return {"sprints": [self.sprint_dict(s) for s in sprints]}

    def list_cards_of(self, project) -> list[Card]:
        """Cards de um projeto — reaproveitado pelo domínio de entrega/métricas."""
        return ListCards(self._projects, self._cards, self._access).execute(
            project_id=str(project.id), actor_id=self.actor_id
        )

    def list_sprints_of(self, project) -> list[Sprint]:
        """Sprints de um projeto — reaproveitado pelo domínio de entrega/métricas."""
        return ListSprints(self._projects, self._sprints, self._access).execute(
            project_id=str(project.id), actor_id=self.actor_id
        )

    def list_workspace_projects(self):
        """Projetos do workspace, já com acesso checado."""
        return ListProjects(self._projects, self._access).execute(
            workspace_id=self.workspace_id, actor_id=self.actor_id
        )

    def _read_list_cards(self, args: dict) -> dict:
        project = self.project_or_raise(args["project_id"])
        cards = self.list_cards_of(project)
        sprint_id = args.get("sprint_id")
        if sprint_id:
            cards = [c for c in cards if c.sprint_id == sprint_id]
        return {"cards": [self.card_dict(c, project.key) for c in cards]}

    def _read_board_summary(self, args: dict) -> dict:
        project = self.project_or_raise(args["project_id"])
        cards = self.list_cards_of(project)
        sprints = self.list_sprints_of(project)
        active = next((s for s in sprints if s.status.value == "active"), None)
        by_status: dict[str, dict] = {}
        for c in cards:
            bucket = by_status.setdefault(c.status.value, {"count": 0, "points": 0})
            bucket["count"] += 1
            bucket["points"] += c.points or 0
        return {
            "project": {"id": project.id, "key": project.key, "name": project.name},
            "total_cards": len(cards),
            "by_status": by_status,
            "active_sprint": self.sprint_dict(active) if active else None,
        }

    @staticmethod
    def card_dict(c: Card, project_key: str) -> dict:
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
    def sprint_dict(s: Sprint) -> dict:
        return {
            "id": s.id,
            "name": s.name,
            "status": s.status.value,
            "goal": s.goal,
            "start_date": s.start_date.isoformat() if s.start_date else None,
            "end_date": s.end_date.isoformat() if s.end_date else None,
        }

    # ── Escrita (só após confirmação do usuário) ─────────────────────────────
    def write_actions(self) -> dict[str, str]:
        return {
            "create_card": "Cria um card num projeto (entrega ou marketing).",
            "update_card": "Altera um card existente (status, pontos, sprint…).",
            "create_sprint": "Cria uma sprint no projeto.",
            "update_sprint": "Altera nome, meta, status ou datas de uma sprint.",
        }

    def write_schema(self) -> dict:
        return {
            "project_id": {"type": "string"},
            "card_id": {"type": "string"},
            "title": {"type": "string"},
            "description": {"type": "string"},
            "priority": {"type": "string", "enum": ENUM_PRIORITY},
            "type": {"type": "string", "enum": ENUM_TYPE},
            "status": {
                "type": "string",
                "enum": ENUM_STATUS,
                "description": "Coluna do card. Ao CRIAR card novo, omita ou use "
                "'todo' para ele aparecer no Quadro. Use 'backlog' apenas se o "
                "usuário pedir.",
            },
            "points": {"type": "integer"},
            "sprint_id": {"type": "string"},
            "channel": {
                "type": "string",
                "enum": ENUM_CHANNEL,
                "description": "Canal de publicação (cards de marketing).",
            },
            "publish_date": {
                "type": "string",
                "description": "Data de publicação YYYY-MM-DD (calendário editorial).",
            },
            "sprint_name": {"type": "string"},
            "goal": {"type": "string"},
            "start_date": {"type": "string", "description": "YYYY-MM-DD"},
            "end_date": {"type": "string", "description": "YYYY-MM-DD"},
        }

    def execute_write(self, action_name: str, action: dict) -> dict:
        return getattr(self, f"_write_{action_name}")(action)

    def _write_create_card(self, a: dict) -> dict:
        project = self.project_or_raise(a["project_id"])
        # Cards novos entram em 'todo' para aparecerem no Quadro. O status
        # 'backlog' não é uma coluna do workflow, então seria invisível — nunca
        # criamos direto no backlog (o usuário move depois se quiser).
        # Projetos de marketing começam em 'briefing'; software em 'todo'.
        default_status = "briefing" if project.template != "software" else "todo"
        status = a.get("status") or default_status
        if status == "backlog":
            status = default_status
        default_type = "post" if project.template != "software" else "feature"
        card = CreateCard(self._projects, self._cards, self._access).execute(
            project_id=str(project.id),
            actor_id=self.actor_id,
            title=a["title"],
            description=a.get("description", ""),
            priority=a.get("priority", "medium"),
            type=a.get("type", default_type),
            status=status,
            source="copilot",
            channel=a.get("channel", ""),
            publish_date=parse_date(a.get("publish_date")),
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

    def resolve_card_id(self, ref: str) -> str:
        """Aceita UUID ou ref legível (ex.: 'T4E-12') e devolve o UUID do card."""
        try:
            if self._cards.get(card_id=ref) is not None:
                return ref
        except Exception:  # noqa: BLE001 — ref não-UUID cai no parsing por chave
            pass
        if "-" in (ref or ""):
            key, _, num = ref.rpartition("-")
            if num.isdigit():
                project = self.project_or_raise(key)
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
                "channel",
            )
            if k in a
        }
        if "publish_date" in a:
            fields["publish_date"] = parse_date(a.get("publish_date"))
        card_id = self.resolve_card_id(a["card_id"])
        card = UpdateCard(
            self._projects, self._cards, self._access, self._history
        ).execute(card_id=card_id, actor_id=self.actor_id, **fields)
        return {"action": "update_card", "id": str(card.id), "title": card.title}

    def _write_create_sprint(self, a: dict) -> dict:
        project = self.project_or_raise(a["project_id"])
        sprint = CreateSprint(self._projects, self._sprints, self._access).execute(
            project_id=str(project.id),
            name=a["sprint_name"],
            actor_id=self.actor_id,
            goal=a.get("goal", ""),
            start_date=parse_date(a.get("start_date")),
            end_date=parse_date(a.get("end_date")),
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
            fields["start_date"] = parse_date(a.get("start_date"))
        if "end_date" in a:
            fields["end_date"] = parse_date(a.get("end_date"))
        sprint = UpdateSprint(
            self._projects, self._sprints, self._access, self._cards
        ).execute(sprint_id=a["sprint_id"], actor_id=self.actor_id, **fields)
        return {"action": "update_sprint", "id": str(sprint.id), "name": sprint.name}
