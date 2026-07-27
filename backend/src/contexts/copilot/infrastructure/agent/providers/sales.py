"""Ferramentas comerciais: funil, negócios, clientes e atividades.

Tudo reaproveita os casos de uso de `sales`, então as invariantes (motivo de
perda obrigatório, probabilidade herdada do estágio, histórico das alterações)
continuam num lugar só. Nada aqui sai da empresa: sem e-mail, sem publicação.
"""
from __future__ import annotations

from datetime import UTC, datetime

from contexts.copilot.infrastructure.agent.base import (
    parse_date,
    parse_datetime,
    tool,
)
from contexts.projects.domain.repositories.project_repository import (
    WorkspaceAccess as ProjectsWorkspaceAccess,
)
from contexts.projects.infrastructure.django.repositories_impl import (
    DjangoProjectRepository,
)
from contexts.sales.application.use_cases.lose_deal import LoseDeal
from contexts.sales.application.use_cases.manage_customers import (
    CreateCustomer,
    ListContacts,
    ListCustomers,
)
from contexts.sales.application.use_cases.manage_deals import (
    CreateDeal,
    GetDeal,
    ListDealHistory,
    ListDeals,
    UpdateDeal,
)
from contexts.sales.application.use_cases.manage_stages import ListStages
from contexts.sales.application.use_cases.move_deal_stage import MoveDealStage
from contexts.sales.application.use_cases.schedule_activity import (
    ListActivities,
    ScheduleActivity,
)
from contexts.sales.application.use_cases.win_deal import WinDeal
from contexts.sales.infrastructure.adapters.meeting_scheduler_impl import (
    GoogleMeetingScheduler,
)
from contexts.sales.infrastructure.adapters.project_creator_impl import (
    ProjectsProjectCreator,
)
from contexts.sales.infrastructure.django.repositories_impl import (
    DjangoActivityRepository,
    DjangoContactRepository,
    DjangoCustomerRepository,
    DjangoDealHistoryRepository,
    DjangoDealRepository,
    DjangoStageRepository,
    DjangoWorkspaceAccess,
)
from shared.domain.errors import ValidationError

ENUM_ACTIVITY_KIND = ["note", "task", "meeting"]


class SalesProvider:
    """Leitura e escrita do funil comercial para o agente."""

    domain = "sales"

    def __init__(self, *, workspace_id: str, actor_id: str):
        self.workspace_id = workspace_id
        self.actor_id = actor_id
        self._deals = DjangoDealRepository()
        self._stages = DjangoStageRepository()
        self._customers = DjangoCustomerRepository()
        self._contacts = DjangoContactRepository()
        self._activities = DjangoActivityRepository()
        self._history = DjangoDealHistoryRepository()
        self._access = DjangoWorkspaceAccess()

    # ── Leitura ──────────────────────────────────────────────────────────────
    def read_tools(self) -> list[dict]:
        return [
            tool(
                "sales_list_stages",
                "Lista os estágios do funil comercial do workspace (id, nome, "
                "ordem, probabilidade padrão, tipo: aberto/ganho/perdido). Use "
                "para descobrir para onde mover um negócio.",
            ),
            tool(
                "sales_list_deals",
                "Lista negócios do funil (id, título, cliente, estágio, valor, "
                "probabilidade, dono, data prevista de fechamento, dias parado). "
                "Filtros opcionais por estágio, cliente e dono.",
                {
                    "stage_id": {"type": "string"},
                    "customer_id": {"type": "string"},
                    "owner_id": {"type": "string"},
                    "only_open": {
                        "type": "boolean",
                        "description": "Só negócios ainda não ganhos nem perdidos.",
                    },
                },
            ),
            tool(
                "sales_read_deal",
                "Detalhe de um negócio: dados, histórico de alterações e "
                "atividades (notas, tarefas, reuniões). Use antes de recomendar "
                "o próximo passo de uma oportunidade.",
                {"deal_id": {"type": "string"}},
                ["deal_id"],
            ),
            tool(
                "sales_list_customers",
                "Lista os clientes do workspace (id, nome, tipo, dono, contatos "
                "principais). Use para achar o customer_id ao criar um negócio.",
            ),
            tool(
                "sales_pipeline_summary",
                "Panorama do funil: por estágio, quantidade de negócios, valor "
                "total e valor ponderado pela probabilidade. Traz também os "
                "negócios parados há mais de N dias e os que vencem em breve. "
                "Use para 'como está o comercial' e para apontar risco.",
                {
                    "stale_days": {
                        "type": "integer",
                        "description": "Dias sem atualização para considerar parado "
                        "(padrão 14).",
                    }
                },
            ),
        ]

    def execute_read(self, name: str, args: dict) -> dict:
        handler = getattr(self, f"_read_{name}", None)
        if handler is None:
            raise ValidationError(f"Ferramenta desconhecida: {name}")
        return handler(args or {})

    # ── Helpers de serialização ──────────────────────────────────────────────
    def _stage_names(self) -> dict[str, str]:
        return {
            str(s.id): s.name
            for s in self._stages.list_by_workspace(workspace_id=self.workspace_id)
        }

    @staticmethod
    def _days_since(moment) -> int | None:
        """Dias desde `moment`. Tolera datetime naive (assume UTC)."""
        if moment is None:
            return None
        if moment.tzinfo is None:
            moment = moment.replace(tzinfo=UTC)
        return (datetime.now(UTC) - moment).days

    def _deal_dict(self, d, stage_names: dict[str, str]) -> dict:
        return {
            "id": str(d.id),
            "title": d.title,
            "customer_id": d.customer_id,
            "customer_name": d.customer_name,
            "stage_id": d.stage_id,
            "stage_name": stage_names.get(str(d.stage_id), ""),
            "amount": str(d.amount),
            "currency": d.currency,
            "probability": d.probability,
            "weighted_amount": str(d.weighted_amount),
            "owner_id": d.owner_id,
            "expected_close_date": (
                d.expected_close_date.isoformat() if d.expected_close_date else None
            ),
            "source": d.source,
            "is_closed": d.is_closed,
            "won_at": d.won_at.isoformat() if d.won_at else None,
            "lost_at": d.lost_at.isoformat() if d.lost_at else None,
            "lost_reason": d.lost_reason,
            "delivery_project_id": d.delivery_project_id,
            "days_since_update": self._days_since(d.updated_at),
        }

    @staticmethod
    def _activity_dict(a) -> dict:
        return {
            "id": str(a.id),
            "kind": a.kind.value,
            "content": a.content,
            "due_date": a.due_date.isoformat() if a.due_date else None,
            "done_at": a.done_at.isoformat() if a.done_at else None,
            "assignee_id": a.assignee_id,
            "meet_url": a.meet_url,
        }

    # ── Handlers de leitura ──────────────────────────────────────────────────
    def _read_sales_list_stages(self, _args: dict) -> dict:
        stages = ListStages(self._stages, self._access).execute(
            workspace_id=self.workspace_id, actor_id=self.actor_id
        )
        return {
            "stages": [
                {
                    "id": str(s.id),
                    "name": s.name,
                    "slug": s.slug,
                    "order": s.order,
                    "probability_default": s.probability_default,
                    "kind": s.kind.value,
                }
                for s in sorted(stages, key=lambda s: s.order)
            ]
        }

    def _all_deals(self, **filters):
        return ListDeals(self._deals, self._access).execute(
            workspace_id=self.workspace_id, actor_id=self.actor_id, **filters
        )

    def _read_sales_list_deals(self, args: dict) -> dict:
        deals = self._all_deals(
            stage_id=args.get("stage_id"),
            customer_id=args.get("customer_id"),
            owner_id=args.get("owner_id"),
        )
        if args.get("only_open"):
            deals = [d for d in deals if not d.is_closed]
        names = self._stage_names()
        return {"deals": [self._deal_dict(d, names) for d in deals]}

    def _read_sales_read_deal(self, args: dict) -> dict:
        deal_id = args["deal_id"]
        deal = GetDeal(self._deals, self._access).execute(
            deal_id=deal_id, actor_id=self.actor_id
        )
        history = ListDealHistory(self._deals, self._access, self._history).execute(
            deal_id=deal_id, actor_id=self.actor_id
        )
        activities = ListActivities(
            self._activities, self._deals, self._access
        ).execute(deal_id=deal_id, actor_id=self.actor_id)
        return {
            "deal": self._deal_dict(deal, self._stage_names()),
            "history": [
                {
                    "field": h.field,
                    "from": h.from_value,
                    "to": h.to_value,
                    "at": h.created_at.isoformat() if h.created_at else None,
                }
                for h in history
            ],
            "activities": [self._activity_dict(a) for a in activities],
        }

    def _read_sales_list_customers(self, _args: dict) -> dict:
        customers = ListCustomers(self._customers, self._access).execute(
            workspace_id=self.workspace_id, actor_id=self.actor_id
        )
        out = []
        for c in customers:
            contacts = ListContacts(
                self._contacts, self._customers, self._access
            ).execute(customer_id=str(c.id), actor_id=self.actor_id)
            out.append(
                {
                    "id": str(c.id),
                    "name": c.name,
                    "kind": c.kind.value,
                    "email": c.email,
                    "phone": c.phone,
                    "owner_id": c.owner_id,
                    "contacts": [
                        {"id": str(k.id), "name": k.name, "email": k.email}
                        for k in contacts
                    ],
                }
            )
        return {"customers": out}

    def _read_sales_pipeline_summary(self, args: dict) -> dict:
        stale_days = int(args.get("stale_days") or 14)
        stages = sorted(
            ListStages(self._stages, self._access).execute(
                workspace_id=self.workspace_id, actor_id=self.actor_id
            ),
            key=lambda s: s.order,
        )
        deals = self._all_deals()
        names = {str(s.id): s.name for s in stages}

        by_stage = []
        for stage in stages:
            in_stage = [d for d in deals if str(d.stage_id) == str(stage.id)]
            by_stage.append(
                {
                    "stage_id": str(stage.id),
                    "stage_name": stage.name,
                    "kind": stage.kind.value,
                    "count": len(in_stage),
                    "amount": str(sum((d.amount for d in in_stage), start=0)),
                    "weighted_amount": str(
                        sum((d.weighted_amount for d in in_stage), start=0)
                    ),
                }
            )

        open_deals = [d for d in deals if not d.is_closed]
        stale = [
            self._deal_dict(d, names)
            for d in open_deals
            if (self._days_since(d.updated_at) or 0) >= stale_days
        ]
        today = datetime.now(UTC).date()
        closing = [
            self._deal_dict(d, names)
            for d in open_deals
            if d.expected_close_date is not None
            and (d.expected_close_date - today).days <= 14
        ]
        return {
            "by_stage": by_stage,
            "open_count": len(open_deals),
            "open_amount": str(sum((d.amount for d in open_deals), start=0)),
            "open_weighted_amount": str(
                sum((d.weighted_amount for d in open_deals), start=0)
            ),
            "stale_days": stale_days,
            "stale_deals": stale,
            "closing_soon": closing,
        }

    # ── Escrita ──────────────────────────────────────────────────────────────
    def write_actions(self) -> dict[str, str]:
        return {
            "create_deal": "Cria um negócio no funil para um cliente existente.",
            "update_deal": "Altera título, valor, probabilidade, dono ou data "
            "prevista de um negócio (não troca de estágio).",
            "move_deal_stage": "Move o negócio para outro estágio do funil.",
            "win_deal": "Marca o negócio como ganho; pode gerar o projeto de "
            "entrega.",
            "lose_deal": "Marca o negócio como perdido — exige lost_reason.",
            "schedule_activity": "Registra nota, tarefa ou reunião num negócio.",
            "create_customer": "Cadastra um cliente novo no workspace.",
        }

    def write_schema(self) -> dict:
        return {
            "deal_id": {"type": "string"},
            "customer_id": {"type": "string"},
            "contact_id": {"type": "string"},
            "stage_id": {"type": "string"},
            "deal_title": {"type": "string"},
            "amount": {"type": "number"},
            "currency": {"type": "string"},
            "probability": {"type": "integer"},
            "expected_close_date": {"type": "string", "description": "YYYY-MM-DD"},
            "owner_id": {"type": "string"},
            "deal_source": {
                "type": "string",
                "description": "Origem do lead (indicação, site, evento…).",
            },
            "create_delivery_project": {
                "type": "boolean",
                "description": "Ao ganhar o negócio, cria o projeto de entrega.",
            },
            "lost_reason": {"type": "string"},
            "lost_notes": {"type": "string"},
            "activity_kind": {"type": "string", "enum": ENUM_ACTIVITY_KIND},
            "activity_content": {"type": "string"},
            "due_date": {
                "type": "string",
                "description": "Data/hora ISO da tarefa ou reunião "
                "(ex.: 2026-08-01T14:00:00-03:00).",
            },
            "end_date_time": {
                "type": "string",
                "description": "Data/hora ISO de fim da reunião.",
            },
            "attendees": {
                "type": "array",
                "items": {"type": "string"},
                "description": "E-mails convidados para a reunião.",
            },
            "customer_name": {"type": "string"},
            "customer_kind": {"type": "string", "enum": ["company", "person"]},
            "customer_email": {"type": "string"},
            "customer_phone": {"type": "string"},
        }

    def execute_write(self, action_name: str, action: dict) -> dict:
        return getattr(self, f"_write_{action_name}")(action)

    def _write_create_deal(self, a: dict) -> dict:
        deal = CreateDeal(
            self._deals, self._stages, self._customers, self._access
        ).execute(
            workspace_id=self.workspace_id,
            actor_id=self.actor_id,
            title=a.get("deal_title", ""),
            customer_id=a.get("customer_id"),
            stage_id=a.get("stage_id"),
            contact_id=a.get("contact_id"),
            amount=a.get("amount"),
            currency=a.get("currency"),
            probability=a.get("probability"),
            expected_close_date=parse_date(a.get("expected_close_date")),
            source=a.get("deal_source", ""),
            owner_id=a.get("owner_id"),
        )
        return {"action": "create_deal", "id": str(deal.id), "title": deal.title}

    def _write_update_deal(self, a: dict) -> dict:
        changes = {}
        if "deal_title" in a:
            changes["title"] = a["deal_title"]
        for key in ("amount", "currency", "probability", "owner_id", "contact_id"):
            if key in a:
                changes[key] = a[key]
        if "deal_source" in a:
            changes["source"] = a["deal_source"]
        if "expected_close_date" in a:
            changes["expected_close_date"] = parse_date(a["expected_close_date"])
        deal = UpdateDeal(self._deals, self._access, self._history).execute(
            deal_id=a["deal_id"], actor_id=self.actor_id, **changes
        )
        return {"action": "update_deal", "id": str(deal.id), "title": deal.title}

    def _write_move_deal_stage(self, a: dict) -> dict:
        deal = MoveDealStage(
            self._deals, self._stages, self._access, self._history
        ).execute(
            deal_id=a["deal_id"], actor_id=self.actor_id, stage_id=a["stage_id"]
        )
        return {
            "action": "move_deal_stage",
            "id": str(deal.id),
            "stage_id": deal.stage_id,
        }

    def _project_creator(self) -> ProjectsProjectCreator:
        """Adaptador de criação do projeto de entrega (fronteira com `projects`)."""

        class _Access(ProjectsWorkspaceAccess):
            def is_member(self, *, workspace_id: str, user_id: str) -> bool:
                return DjangoWorkspaceAccess().is_member(
                    workspace_id=workspace_id, user_id=user_id
                )

        return ProjectsProjectCreator(
            project_repository=DjangoProjectRepository(), workspace_access=_Access()
        )

    def _write_win_deal(self, a: dict) -> dict:
        result = WinDeal(
            self._deals,
            self._stages,
            self._customers,
            self._access,
            self._history,
            self._project_creator(),
        ).execute(
            deal_id=a["deal_id"],
            actor_id=self.actor_id,
            create_delivery_project=bool(a.get("create_delivery_project")),
        )
        return {
            "action": "win_deal",
            "id": str(result.deal.id),
            "title": result.deal.title,
            "delivery_project_id": result.delivery_project_id,
            "delivery_project_key": result.delivery_project_key,
            "created_delivery_project": result.created_delivery_project,
        }

    def _write_lose_deal(self, a: dict) -> dict:
        deal = LoseDeal(
            self._deals, self._stages, self._access, self._history
        ).execute(
            deal_id=a["deal_id"],
            actor_id=self.actor_id,
            lost_reason=a.get("lost_reason", ""),
            lost_notes=a.get("lost_notes", ""),
        )
        return {"action": "lose_deal", "id": str(deal.id), "title": deal.title}

    def _write_schedule_activity(self, a: dict) -> dict:
        result = ScheduleActivity(
            self._activities,
            self._deals,
            self._access,
            GoogleMeetingScheduler(),
        ).execute(
            deal_id=a["deal_id"],
            actor_id=self.actor_id,
            kind=a.get("activity_kind", "note"),
            content=a.get("activity_content", ""),
            due_date=parse_datetime(a.get("due_date")),
            end_date=parse_datetime(a.get("end_date_time")),
            attendees=a.get("attendees") or [],
        )
        return {
            "action": "schedule_activity",
            "id": str(result.activity.id),
            "kind": result.activity.kind.value,
            "meet_url": result.activity.meet_url,
            "warning": result.warning,
        }

    def _write_create_customer(self, a: dict) -> dict:
        customer = CreateCustomer(self._customers, self._access).execute(
            workspace_id=self.workspace_id,
            actor_id=self.actor_id,
            name=a.get("customer_name", ""),
            kind=a.get("customer_kind", "company"),
            email=a.get("customer_email", ""),
            phone=a.get("customer_phone", ""),
        )
        return {
            "action": "create_customer",
            "id": str(customer.id),
            "name": customer.name,
        }
