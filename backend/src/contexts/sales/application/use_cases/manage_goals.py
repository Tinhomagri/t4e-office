"""Casos de uso de metas comerciais (quotas)."""
from decimal import Decimal

from contexts.sales.application.use_cases._access import assert_workspace_member
from contexts.sales.domain.entities.goal import Goal
from contexts.sales.domain.repositories.customer_repository import WorkspaceAccess
from contexts.sales.domain.repositories.goal_repository import GoalRepository
from shared.domain.errors import NotFoundError


class CreateGoal:
    """Define a meta de um workspace (geral ou por vendedor) num período."""

    def __init__(self, goal_repository: GoalRepository, workspace_access: WorkspaceAccess):
        self.goal_repository = goal_repository
        self.workspace_access = workspace_access

    def execute(self, *, workspace_id: str, actor_id: str, **data) -> Goal:
        assert_workspace_member(
            self.workspace_access, workspace_id=workspace_id, actor_id=actor_id
        )
        return self.goal_repository.create(
            goal=Goal(
                id=None,
                workspace_id=workspace_id,
                period=data.get("period", ""),
                target_amount=Decimal(str(data.get("target_amount", "0"))),
                currency=data.get("currency") or "BRL",
                owner_id=data.get("owner_id") or None,
            )
        )


class ListGoals:
    """Lista as metas de um workspace, opcionalmente filtradas por período/dono."""

    def __init__(self, goal_repository: GoalRepository, workspace_access: WorkspaceAccess):
        self.goal_repository = goal_repository
        self.workspace_access = workspace_access

    def execute(
        self,
        *,
        workspace_id: str,
        actor_id: str,
        period: str | None = None,
        owner_id: str | None = None,
    ) -> list[Goal]:
        assert_workspace_member(
            self.workspace_access, workspace_id=workspace_id, actor_id=actor_id
        )
        return self.goal_repository.list_by_workspace(
            workspace_id=workspace_id, period=period, owner_id=owner_id
        )


class GetGoal:
    """Busca uma meta garantindo acesso ao workspace dono."""

    def __init__(self, goal_repository: GoalRepository, workspace_access: WorkspaceAccess):
        self.goal_repository = goal_repository
        self.workspace_access = workspace_access

    def execute(self, *, goal_id: str, actor_id: str) -> Goal:
        goal = self.goal_repository.get(goal_id=goal_id)
        if goal is None:
            raise NotFoundError("Meta não encontrada.")
        assert_workspace_member(
            self.workspace_access, workspace_id=goal.workspace_id, actor_id=actor_id
        )
        return goal


class UpdateGoal:
    """Atualiza parcialmente uma meta (valor alvo ou moeda)."""

    def __init__(self, goal_repository: GoalRepository, workspace_access: WorkspaceAccess):
        self.goal_repository = goal_repository
        self.workspace_access = workspace_access

    def execute(self, *, goal_id: str, actor_id: str, **changes) -> Goal:
        goal = GetGoal(self.goal_repository, self.workspace_access).execute(
            goal_id=goal_id, actor_id=actor_id
        )
        if changes.get("target_amount") is not None:
            goal.target_amount = Decimal(str(changes["target_amount"]))
        if changes.get("currency"):
            goal.currency = changes["currency"]
        goal.__post_init__()
        return self.goal_repository.update(goal=goal)


class DeleteGoal:
    """Remove uma meta."""

    def __init__(self, goal_repository: GoalRepository, workspace_access: WorkspaceAccess):
        self.goal_repository = goal_repository
        self.workspace_access = workspace_access

    def execute(self, *, goal_id: str, actor_id: str) -> None:
        GetGoal(self.goal_repository, self.workspace_access).execute(
            goal_id=goal_id, actor_id=actor_id
        )
        self.goal_repository.delete(goal_id=goal_id)
