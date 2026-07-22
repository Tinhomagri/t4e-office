"""Casos de uso de CRUD de negócios do funil."""
from decimal import Decimal

from contexts.sales.application.use_cases._access import assert_workspace_member
from contexts.sales.domain.entities.deal import Deal
from contexts.sales.domain.repositories.customer_repository import (
    CustomerRepository,
    WorkspaceAccess,
)
from contexts.sales.domain.repositories.deal_repository import DealRepository
from contexts.sales.domain.repositories.history_repository import DealHistoryRepository
from contexts.sales.domain.repositories.stage_repository import StageRepository
from contexts.sales.domain.services.ranking import next_rank_after
from shared.domain.errors import NotFoundError, ValidationError


class CreateDeal:
    """Cria um negócio no funil, herdando a probabilidade padrão do estágio."""

    def __init__(
        self,
        deal_repository: DealRepository,
        stage_repository: StageRepository,
        customer_repository: CustomerRepository,
        workspace_access: WorkspaceAccess,
    ):
        self.deal_repository = deal_repository
        self.stage_repository = stage_repository
        self.customer_repository = customer_repository
        self.workspace_access = workspace_access

    def execute(self, *, workspace_id: str, actor_id: str, **data) -> Deal:
        assert_workspace_member(
            self.workspace_access, workspace_id=workspace_id, actor_id=actor_id
        )

        customer = self.customer_repository.get(customer_id=data.get("customer_id"))
        if customer is None or customer.workspace_id != workspace_id:
            raise NotFoundError("Cliente não encontrado neste workspace.")

        stage_id = data.get("stage_id")
        if stage_id:
            stage = self.stage_repository.get(stage_id=stage_id)
        else:
            # Sem estágio informado: entra na primeira coluna do funil
            stages = sorted(
                self.stage_repository.list_by_workspace(workspace_id=workspace_id),
                key=lambda s: s.order,
            )
            stage = stages[0] if stages else None
        if stage is None or stage.workspace_id != workspace_id:
            raise NotFoundError("Estágio não encontrado neste workspace.")

        probability = data.get("probability")
        if probability is None:
            probability = stage.probability_default

        last_rank = self.deal_repository.last_rank_in_stage(
            workspace_id=workspace_id, stage_id=str(stage.id)
        )
        return self.deal_repository.create(
            deal=Deal(
                id=None,
                workspace_id=workspace_id,
                title=data.get("title", ""),
                customer_id=str(customer.id),
                stage_id=str(stage.id),
                contact_id=data.get("contact_id"),
                amount=Decimal(str(data.get("amount") or "0")),
                currency=data.get("currency") or "BRL",
                probability=probability,
                expected_close_date=data.get("expected_close_date"),
                source=data.get("source", "") or "",
                owner_id=data.get("owner_id") or actor_id,
                rank=next_rank_after(last_rank),
            )
        )


class ListDeals:
    """Lista os negócios do workspace com filtros opcionais."""

    def __init__(
        self,
        deal_repository: DealRepository,
        workspace_access: WorkspaceAccess,
    ):
        self.deal_repository = deal_repository
        self.workspace_access = workspace_access

    def execute(
        self,
        *,
        workspace_id: str,
        actor_id: str,
        stage_id: str | None = None,
        customer_id: str | None = None,
        owner_id: str | None = None,
    ) -> list[Deal]:
        assert_workspace_member(
            self.workspace_access, workspace_id=workspace_id, actor_id=actor_id
        )
        return self.deal_repository.list_by_workspace(
            workspace_id=workspace_id,
            stage_id=stage_id,
            customer_id=customer_id,
            owner_id=owner_id,
        )


class GetDeal:
    """Busca um negócio garantindo o acesso ao workspace dono."""

    def __init__(
        self,
        deal_repository: DealRepository,
        workspace_access: WorkspaceAccess,
    ):
        self.deal_repository = deal_repository
        self.workspace_access = workspace_access

    def execute(self, *, deal_id: str, actor_id: str) -> Deal:
        deal = self.deal_repository.get(deal_id=deal_id)
        if deal is None:
            raise NotFoundError("Negócio não encontrado.")
        assert_workspace_member(
            self.workspace_access, workspace_id=deal.workspace_id, actor_id=actor_id
        )
        return deal


class UpdateDeal:
    """Atualiza parcialmente um negócio, gravando histórico dos campos alterados."""

    _FIELDS = (
        "title", "amount", "currency", "probability", "expected_close_date",
        "source", "owner_id", "contact_id", "customer_id", "rank",
    )

    def __init__(
        self,
        deal_repository: DealRepository,
        workspace_access: WorkspaceAccess,
        history_repository: DealHistoryRepository,
    ):
        self.deal_repository = deal_repository
        self.workspace_access = workspace_access
        self.history_repository = history_repository

    def execute(self, *, deal_id: str, actor_id: str, **changes) -> Deal:
        deal = GetDeal(self.deal_repository, self.workspace_access).execute(
            deal_id=deal_id, actor_id=actor_id
        )
        if "stage_id" in changes:
            raise ValidationError(
                "Use a ação de mover estágio para trocar o negócio de coluna."
            )

        touched: list[tuple[str, str, str]] = []
        for field in self._FIELDS:
            if changes.get(field) is None:
                continue
            old = getattr(deal, field)
            new = changes[field]
            if field == "amount":
                new = Decimal(str(new))
            if str(old) == str(new):
                continue
            setattr(deal, field, new)
            touched.append((field, str(old or ""), str(new or "")))

        deal.__post_init__()  # revalida invariantes (valor, moeda, probabilidade)
        updated = self.deal_repository.update(deal=deal)
        for field, old, new in touched:
            self.history_repository.record(
                deal_id=deal_id,
                author_id=actor_id,
                field=field,
                from_value=old,
                to_value=new,
            )
        return updated


class DeleteDeal:
    """Remove um negócio do funil."""

    def __init__(
        self,
        deal_repository: DealRepository,
        workspace_access: WorkspaceAccess,
    ):
        self.deal_repository = deal_repository
        self.workspace_access = workspace_access

    def execute(self, *, deal_id: str, actor_id: str) -> None:
        GetDeal(self.deal_repository, self.workspace_access).execute(
            deal_id=deal_id, actor_id=actor_id
        )
        self.deal_repository.delete(deal_id=deal_id)


class ListDealHistory:
    """Lista o histórico de alterações de um negócio."""

    def __init__(
        self,
        deal_repository: DealRepository,
        workspace_access: WorkspaceAccess,
        history_repository: DealHistoryRepository,
    ):
        self.deal_repository = deal_repository
        self.workspace_access = workspace_access
        self.history_repository = history_repository

    def execute(self, *, deal_id: str, actor_id: str):
        GetDeal(self.deal_repository, self.workspace_access).execute(
            deal_id=deal_id, actor_id=actor_id
        )
        return self.history_repository.list_by_deal(deal_id=deal_id)
