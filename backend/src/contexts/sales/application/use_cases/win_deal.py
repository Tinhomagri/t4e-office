"""Caso de uso: marcar um negócio como ganho."""
from dataclasses import dataclass
from datetime import UTC, datetime

from contexts.sales.application.use_cases.manage_deals import GetDeal
from contexts.sales.domain.entities.deal import Deal
from contexts.sales.domain.entities.stage import StageKind
from contexts.sales.domain.ports.project_creator import ProjectCreator
from contexts.sales.domain.repositories.customer_repository import (
    CustomerRepository,
    WorkspaceAccess,
)
from contexts.sales.domain.repositories.deal_repository import DealRepository
from contexts.sales.domain.repositories.history_repository import DealHistoryRepository
from contexts.sales.domain.repositories.stage_repository import StageRepository
from shared.domain.errors import ValidationError


@dataclass
class WinDealResult:
    """Resultado do ganho, com o projeto de entrega quando criado."""

    deal: Deal
    delivery_project_id: str | None = None
    delivery_project_key: str = ""
    created_delivery_project: bool = False


class WinDeal:
    """Fecha o negócio como ganho e, opcionalmente, gera o projeto de entrega.

    Idempotente em dois níveis: reganhar um negócio já ganho não duplica o
    histórico nem o projeto; se `delivery_project_id` já existe, nenhum outro
    projeto é criado.
    """

    def __init__(
        self,
        deal_repository: DealRepository,
        stage_repository: StageRepository,
        customer_repository: CustomerRepository,
        workspace_access: WorkspaceAccess,
        history_repository: DealHistoryRepository,
        project_creator: ProjectCreator,
    ):
        self.deal_repository = deal_repository
        self.stage_repository = stage_repository
        self.customer_repository = customer_repository
        self.workspace_access = workspace_access
        self.history_repository = history_repository
        self.project_creator = project_creator

    def execute(
        self,
        *,
        deal_id: str,
        actor_id: str,
        create_delivery_project: bool = False,
    ) -> WinDealResult:
        deal = GetDeal(self.deal_repository, self.workspace_access).execute(
            deal_id=deal_id, actor_id=actor_id
        )
        won_stage = self.stage_repository.find_by_kind(
            workspace_id=deal.workspace_id, kind=StageKind.WON
        )
        if won_stage is None:
            raise ValidationError("O funil não tem um estágio de ganho configurado.")

        already_won = deal.won_at is not None
        if not already_won:
            deal.won_at = datetime.now(UTC)
            deal.lost_at = None
            deal.lost_reason = ""
            deal.lost_notes = ""
            deal.stage_id = str(won_stage.id)
            deal.probability = won_stage.probability_default

        created = False
        project_key = ""
        if create_delivery_project and deal.delivery_project_id is None:
            project = self._create_delivery_project(deal=deal, actor_id=actor_id)
            deal.delivery_project_id = project.project_id
            project_key = project.key
            created = True

        updated = self.deal_repository.update(deal=deal)

        if not already_won:
            self.history_repository.record(
                deal_id=deal_id,
                author_id=actor_id,
                field="status",
                from_value="aberto",
                to_value="ganho",
            )
        if created:
            self.history_repository.record(
                deal_id=deal_id,
                author_id=actor_id,
                field="delivery_project",
                from_value="",
                to_value=project_key,
            )
        return WinDealResult(
            deal=updated,
            delivery_project_id=updated.delivery_project_id,
            delivery_project_key=project_key,
            created_delivery_project=created,
        )

    def _create_delivery_project(self, *, deal: Deal, actor_id: str):
        """Deriva nome e chave do projeto a partir do cliente e do negócio."""
        customer = self.customer_repository.get(customer_id=deal.customer_id)
        customer_name = customer.name if customer else ""
        name = f"{customer_name} — {deal.title}" if customer_name else deal.title
        # Chave sugerida: primeiras letras do cliente (o adaptador resolve colisões)
        key_hint = (customer_name or deal.title).replace(" ", "")[:10]
        return self.project_creator.create(
            workspace_id=deal.workspace_id,
            name=name[:120],
            key_hint=key_hint,
            actor_id=actor_id,
        )
