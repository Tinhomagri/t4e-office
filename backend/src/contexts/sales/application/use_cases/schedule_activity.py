"""Casos de uso de atividades do negócio (notas, tarefas e reuniões)."""
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from contexts.sales.application.use_cases._access import assert_workspace_member
from contexts.sales.application.use_cases.manage_deals import GetDeal
from contexts.sales.domain.entities.activity import ActivityKind, DealActivity
from contexts.sales.domain.ports.meeting_scheduler import (
    MeetingScheduler,
    MeetingSchedulerUnavailableError,
)
from contexts.sales.domain.repositories.activity_repository import ActivityRepository
from contexts.sales.domain.repositories.customer_repository import WorkspaceAccess
from contexts.sales.domain.repositories.deal_repository import DealRepository
from shared.domain.errors import NotFoundError

# Duração padrão de uma reunião comercial quando o fim não é informado.
DEFAULT_MEETING_MINUTES = 60


@dataclass
class ScheduleActivityResult:
    """Atividade criada e, quando houver, o aviso de degradação da integração."""

    activity: DealActivity
    warning: str = ""


class ScheduleActivity:
    """Registra nota, tarefa ou reunião num negócio.

    Reuniões tentam criar o evento na Agenda do usuário. Se ele não tiver o Google
    conectado, a atividade é criada mesmo assim e o resultado traz um aviso —
    a operação nunca é bloqueada por causa da integração.
    """

    def __init__(
        self,
        activity_repository: ActivityRepository,
        deal_repository: DealRepository,
        workspace_access: WorkspaceAccess,
        meeting_scheduler: MeetingScheduler | None = None,
    ):
        self.activity_repository = activity_repository
        self.deal_repository = deal_repository
        self.workspace_access = workspace_access
        self.meeting_scheduler = meeting_scheduler

    def execute(
        self,
        *,
        deal_id: str,
        actor_id: str,
        kind: str = "note",
        content: str = "",
        due_date: datetime | None = None,
        end_date: datetime | None = None,
        assignee_id: str | None = None,
        attendees: list[str] | None = None,
    ) -> ScheduleActivityResult:
        deal = GetDeal(self.deal_repository, self.workspace_access).execute(
            deal_id=deal_id, actor_id=actor_id
        )
        activity_kind = ActivityKind(kind)

        if activity_kind == ActivityKind.MEETING and end_date is None and due_date:
            end_date = due_date + timedelta(minutes=DEFAULT_MEETING_MINUTES)

        activity = DealActivity(
            id=None,
            deal_id=str(deal.id),
            kind=activity_kind,
            content=content,
            author_id=actor_id,
            due_date=due_date,
            end_date=end_date,
            assignee_id=assignee_id,
            created_at=datetime.now(UTC),
        )

        warning = ""
        if activity_kind == ActivityKind.MEETING:
            warning = self._try_schedule(
                activity=activity,
                actor_id=actor_id,
                attendees=attendees or [],
            )

        created = self.activity_repository.create(activity=activity)
        return ScheduleActivityResult(activity=created, warning=warning)

    def _try_schedule(
        self, *, activity: DealActivity, actor_id: str, attendees: list[str]
    ) -> str:
        """Tenta criar o evento na Agenda. Devolve o aviso quando não for possível."""
        if self.meeting_scheduler is None:
            return "Reunião registrada sem evento na Agenda: Google não configurado."
        try:
            meeting = self.meeting_scheduler.schedule(
                user_id=actor_id,
                title=activity.content[:120],
                start=activity.due_date,
                end=activity.end_date,
                attendees=attendees,
                description=activity.content,
            )
        except MeetingSchedulerUnavailableError:
            return (
                "Reunião registrada, mas o evento não foi criado na Agenda: "
                "conecte sua conta Google."
            )
        activity.google_event_id = meeting.event_id
        activity.meet_url = meeting.meet_url
        return ""


class ListActivities:
    """Lista as atividades de um negócio."""

    def __init__(
        self,
        activity_repository: ActivityRepository,
        deal_repository: DealRepository,
        workspace_access: WorkspaceAccess,
    ):
        self.activity_repository = activity_repository
        self.deal_repository = deal_repository
        self.workspace_access = workspace_access

    def execute(self, *, deal_id: str, actor_id: str) -> list[DealActivity]:
        GetDeal(self.deal_repository, self.workspace_access).execute(
            deal_id=deal_id, actor_id=actor_id
        )
        return self.activity_repository.list_by_deal(deal_id=deal_id)


class UpdateActivity:
    """Atualiza uma atividade — em especial, conclui ou reabre uma tarefa."""

    def __init__(
        self,
        activity_repository: ActivityRepository,
        deal_repository: DealRepository,
        workspace_access: WorkspaceAccess,
    ):
        self.activity_repository = activity_repository
        self.deal_repository = deal_repository
        self.workspace_access = workspace_access

    def _load(self, activity_id: str, actor_id: str) -> DealActivity:
        activity = self.activity_repository.get(activity_id=activity_id)
        if activity is None:
            raise NotFoundError("Atividade não encontrada.")
        GetDeal(self.deal_repository, self.workspace_access).execute(
            deal_id=activity.deal_id, actor_id=actor_id
        )
        return activity

    def execute(self, *, activity_id: str, actor_id: str, **changes) -> DealActivity:
        activity = self._load(activity_id, actor_id)
        for field in ("content", "due_date", "end_date", "assignee_id"):
            if changes.get(field) is not None:
                setattr(activity, field, changes[field])
        if changes.get("done") is not None:
            activity.done_at = datetime.now(UTC) if changes["done"] else None
        activity.__post_init__()
        return self.activity_repository.update(activity=activity)


class DeleteActivity(UpdateActivity):
    """Remove uma atividade do negócio."""

    def execute(self, *, activity_id: str, actor_id: str, **_changes) -> None:
        self._load(activity_id, actor_id)
        self.activity_repository.delete(activity_id=activity_id)


class ListWorkspaceActivities:
    """Lista as atividades de todos os negócios do workspace (aba Atividades)."""

    def __init__(
        self,
        activity_repository: ActivityRepository,
        workspace_access: WorkspaceAccess,
    ):
        self.activity_repository = activity_repository
        self.workspace_access = workspace_access

    def execute(
        self,
        *,
        workspace_id: str,
        actor_id: str,
        kind: str | None = None,
        assignee_id: str | None = None,
        pending_only: bool = False,
    ) -> list[DealActivity]:
        assert_workspace_member(
            self.workspace_access, workspace_id=workspace_id, actor_id=actor_id
        )
        return self.activity_repository.list_by_workspace(
            workspace_id=workspace_id,
            kind=kind,
            assignee_id=assignee_id,
            pending_only=pending_only,
        )
