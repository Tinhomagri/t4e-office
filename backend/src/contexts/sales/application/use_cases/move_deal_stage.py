"""Caso de uso: mover um negócio de estágio no funil."""
from contexts.sales.application.use_cases.manage_deals import GetDeal
from contexts.sales.domain.entities.deal import Deal
from contexts.sales.domain.repositories.customer_repository import WorkspaceAccess
from contexts.sales.domain.repositories.deal_repository import DealRepository
from contexts.sales.domain.repositories.history_repository import DealHistoryRepository
from contexts.sales.domain.repositories.stage_repository import StageRepository
from contexts.sales.domain.services.ranking import next_rank_after, rank_for_position
from shared.domain.errors import NotFoundError, ValidationError


class MoveDealStage:
    """Move o negócio para outro estágio, ajustando a probabilidade e gravando histórico.

    Regra da probabilidade: o valor só é substituído pelo padrão do novo estágio
    quando o valor atual ainda é o padrão do estágio de origem — ou seja, quando o
    usuário não editou manualmente a probabilidade.
    """

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
        stage_id: str,
        previous_deal_id: str | None = None,
        next_deal_id: str | None = None,
    ) -> Deal:
        deal = GetDeal(self.deal_repository, self.workspace_access).execute(
            deal_id=deal_id, actor_id=actor_id
        )
        target = self.stage_repository.get(stage_id=stage_id)
        if target is None or target.workspace_id != deal.workspace_id:
            raise NotFoundError("Estágio não encontrado neste workspace.")

        origin = self.stage_repository.get(stage_id=deal.stage_id)
        same_stage = origin is not None and str(origin.id) == str(target.id)
        # Soltar o card na própria coluna é reordenação, não mudança de estágio:
        # só recalcula o rank, sem mexer na probabilidade nem gravar histórico.
        # Sem vizinho informado não há o que reordenar — aí continua sendo erro.
        reordering = same_stage and (previous_deal_id is not None or next_deal_id is not None)
        if same_stage and not reordering:
            raise ValidationError("O negócio já está neste estágio.")

        old_stage_name = origin.name if origin else ""
        old_probability = deal.probability

        # Probabilidade: preserva a edição manual do usuário
        if not reordering and (origin is None or deal.probability == origin.probability_default):
            deal.probability = target.probability_default

        deal.stage_id = str(target.id)
        deal.rank = self._resolve_rank(
            workspace_id=deal.workspace_id,
            stage_id=str(target.id),
            previous_deal_id=previous_deal_id,
            next_deal_id=next_deal_id,
        )
        updated = self.deal_repository.update(deal=deal)

        if reordering:
            return updated

        self.history_repository.record(
            deal_id=deal_id,
            author_id=actor_id,
            field="stage",
            from_value=old_stage_name,
            to_value=target.name,
        )
        if updated.probability != old_probability:
            self.history_repository.record(
                deal_id=deal_id,
                author_id=actor_id,
                field="probability",
                from_value=str(old_probability),
                to_value=str(updated.probability),
            )
        return updated

    def _resolve_rank(
        self,
        *,
        workspace_id: str,
        stage_id: str,
        previous_deal_id: str | None,
        next_deal_id: str | None,
    ) -> str:
        """Calcula o rank do negócio na coluna destino."""
        if previous_deal_id is None and next_deal_id is None:
            last = self.deal_repository.last_rank_in_stage(
                workspace_id=workspace_id, stage_id=stage_id
            )
            return next_rank_after(last)
        previous = (
            self.deal_repository.get(deal_id=previous_deal_id)
            if previous_deal_id
            else None
        )
        following = (
            self.deal_repository.get(deal_id=next_deal_id) if next_deal_id else None
        )
        return rank_for_position(
            previous.rank if previous else "",
            following.rank if following else "",
        )
