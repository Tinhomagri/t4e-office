"""Caso de uso: marcar um negócio como perdido."""
from datetime import UTC, datetime

from contexts.sales.application.use_cases.manage_deals import GetDeal
from contexts.sales.domain.entities.deal import Deal
from contexts.sales.domain.entities.stage import StageKind
from contexts.sales.domain.repositories.customer_repository import WorkspaceAccess
from contexts.sales.domain.repositories.deal_repository import DealRepository
from contexts.sales.domain.repositories.history_repository import DealHistoryRepository
from contexts.sales.domain.repositories.stage_repository import StageRepository
from shared.domain.errors import ValidationError


class LoseDeal:
    """Fecha o negócio como perdido. O motivo da perda é obrigatório."""

    def __init__(
        self,
        deal_repository: DealRepository,
        stage_repository: StageRepository,
        workspace_access: WorkspaceAccess,
        history_repository: DealHistoryRepository,
    ):
        self.deal_repository = deal_repository
        self.stage_repository = stage_repository
        self.workspace_access = workspace_access
        self.history_repository = history_repository

    def execute(
        self,
        *,
        deal_id: str,
        actor_id: str,
        lost_reason: str,
        lost_notes: str = "",
    ) -> Deal:
        if not (lost_reason or "").strip():
            raise ValidationError("Informe o motivo da perda do negócio.")

        deal = GetDeal(self.deal_repository, self.workspace_access).execute(
            deal_id=deal_id, actor_id=actor_id
        )
        lost_stage = self.stage_repository.find_by_kind(
            workspace_id=deal.workspace_id, kind=StageKind.LOST
        )
        if lost_stage is None:
            raise ValidationError("O funil não tem um estágio de perda configurado.")

        already_lost = deal.lost_at is not None
        deal.lost_reason = lost_reason.strip()
        deal.lost_notes = (lost_notes or "").strip()
        deal.stage_id = str(lost_stage.id)
        deal.probability = lost_stage.probability_default
        deal.won_at = None
        if not already_lost:
            deal.lost_at = datetime.now(UTC)

        updated = self.deal_repository.update(deal=deal)
        if not already_lost:
            self.history_repository.record(
                deal_id=deal_id,
                author_id=actor_id,
                field="status",
                from_value="aberto",
                to_value=f"perdido ({deal.lost_reason})",
            )
        return updated
