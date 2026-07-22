"""Implementações Django dos repositórios do contexto sales."""
from django.db.models import Max, Q

from contexts.identity.infrastructure.django.models import MembershipModel
from contexts.sales.domain.entities.activity import ActivityKind, DealActivity
from contexts.sales.domain.entities.contact import Contact
from contexts.sales.domain.entities.customer import Customer, CustomerKind
from contexts.sales.domain.entities.deal import Deal
from contexts.sales.domain.entities.history import DealHistoryEntry
from contexts.sales.domain.entities.stage import PipelineStage, StageKind
from contexts.sales.domain.repositories.activity_repository import ActivityRepository
from contexts.sales.domain.repositories.customer_repository import (
    ContactRepository,
    CustomerRepository,
    WorkspaceAccess,
)
from contexts.sales.domain.repositories.deal_repository import DealRepository
from contexts.sales.domain.repositories.history_repository import DealHistoryRepository
from contexts.sales.domain.repositories.stage_repository import StageRepository
from contexts.sales.infrastructure.django.models import (
    ContactModel,
    CustomerModel,
    DealActivityModel,
    DealHistoryModel,
    DealModel,
    PipelineStageModel,
)

# ── Tradutores ORM → entidade ────────────────────────────────────────────────

def _customer_to_entity(row: CustomerModel) -> Customer:
    """Traduz o model ORM de cliente para a entidade de domínio."""
    return Customer(
        id=str(row.id),
        workspace_id=str(row.workspace_id),
        name=row.name,
        kind=CustomerKind(row.kind),
        legal_name=row.legal_name,
        document=row.document,
        email=row.email,
        phone=row.phone,
        website=row.website,
        notes=row.notes,
        owner_id=str(row.owner_id) if row.owner_id else None,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _contact_to_entity(row: ContactModel) -> Contact:
    """Traduz o model ORM de contato para a entidade de domínio."""
    return Contact(
        id=str(row.id),
        customer_id=str(row.customer_id),
        name=row.name,
        role=row.role,
        email=row.email,
        phone=row.phone,
        is_primary=row.is_primary,
    )


def _stage_to_entity(row: PipelineStageModel) -> PipelineStage:
    """Traduz o model ORM de estágio para a entidade de domínio."""
    return PipelineStage(
        id=str(row.id),
        workspace_id=str(row.workspace_id),
        name=row.name,
        slug=row.slug,
        color=row.color,
        order=row.order,
        probability_default=row.probability_default,
        kind=StageKind(row.kind),
    )


def _deal_to_entity(row: DealModel) -> Deal:
    """Traduz o model ORM de negócio para a entidade de domínio."""
    return Deal(
        id=str(row.id),
        workspace_id=str(row.workspace_id),
        title=row.title,
        customer_id=str(row.customer_id),
        stage_id=str(row.stage_id),
        contact_id=str(row.contact_id) if row.contact_id else None,
        amount=row.amount,
        currency=row.currency,
        probability=row.probability,
        expected_close_date=row.expected_close_date,
        source=row.source,
        owner_id=str(row.owner_id) if row.owner_id else None,
        lost_reason=row.lost_reason,
        lost_notes=row.lost_notes,
        won_at=row.won_at,
        lost_at=row.lost_at,
        delivery_project_id=(
            str(row.delivery_project_id) if row.delivery_project_id else None
        ),
        rank=row.rank,
        customer_name=row.customer.name if row.customer_id else "",
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _activity_to_entity(row: DealActivityModel) -> DealActivity:
    """Traduz o model ORM de atividade para a entidade de domínio."""
    return DealActivity(
        id=str(row.id),
        deal_id=str(row.deal_id),
        kind=ActivityKind(row.kind),
        content=row.content,
        author_id=str(row.author_id) if row.author_id else None,
        due_date=row.due_date,
        end_date=row.end_date,
        assignee_id=str(row.assignee_id) if row.assignee_id else None,
        done_at=row.done_at,
        google_event_id=row.google_event_id,
        meet_url=row.meet_url,
        created_at=row.created_at,
    )


def _history_to_entity(row: DealHistoryModel) -> DealHistoryEntry:
    """Traduz o model ORM de histórico para a entidade de domínio."""
    return DealHistoryEntry(
        id=str(row.id),
        deal_id=str(row.deal_id),
        author_id=str(row.author_id) if row.author_id else None,
        field=row.field,
        from_value=row.from_value,
        to_value=row.to_value,
        created_at=row.created_at,
        author_name=row.author.full_name if row.author_id else "",
    )


# ── Repositórios ─────────────────────────────────────────────────────────────

class DjangoWorkspaceAccess(WorkspaceAccess):
    """Verifica pertencimento ao workspace via contexto identity."""

    def is_member(self, *, workspace_id: str, user_id: str) -> bool:
        return MembershipModel.objects.filter(
            workspace_id=workspace_id, user_id=user_id
        ).exists()


class DjangoCustomerRepository(CustomerRepository):
    """Persistência de clientes via Django ORM."""

    def create(self, *, customer: Customer) -> Customer:
        row = CustomerModel.objects.create(
            workspace_id=customer.workspace_id,
            kind=customer.kind.value,
            name=customer.name,
            legal_name=customer.legal_name,
            document=customer.document,
            email=customer.email,
            phone=customer.phone,
            website=customer.website,
            notes=customer.notes,
            owner_id=customer.owner_id,
        )
        return _customer_to_entity(row)

    def get(self, *, customer_id: str) -> Customer | None:
        row = CustomerModel.objects.filter(id=customer_id).first()
        return _customer_to_entity(row) if row else None

    def list_by_workspace(self, *, workspace_id: str, search: str = "") -> list[Customer]:
        qs = CustomerModel.objects.filter(workspace_id=workspace_id)
        if search:
            qs = qs.filter(
                Q(name__icontains=search)
                | Q(legal_name__icontains=search)
                | Q(document__icontains=search)
                | Q(email__icontains=search)
            )
        return [_customer_to_entity(r) for r in qs]

    def update(self, *, customer: Customer) -> Customer:
        row = CustomerModel.objects.get(id=customer.id)
        row.kind = customer.kind.value
        row.name = customer.name
        row.legal_name = customer.legal_name
        row.document = customer.document
        row.email = customer.email
        row.phone = customer.phone
        row.website = customer.website
        row.notes = customer.notes
        row.owner_id = customer.owner_id
        row.save()
        return _customer_to_entity(row)

    def delete(self, *, customer_id: str) -> None:
        CustomerModel.objects.filter(id=customer_id).delete()


class DjangoContactRepository(ContactRepository):
    """Persistência de contatos via Django ORM."""

    def create(self, *, contact: Contact) -> Contact:
        row = ContactModel.objects.create(
            customer_id=contact.customer_id,
            name=contact.name,
            role=contact.role,
            email=contact.email,
            phone=contact.phone,
            is_primary=contact.is_primary,
        )
        return _contact_to_entity(row)

    def get(self, *, contact_id: str) -> Contact | None:
        row = ContactModel.objects.filter(id=contact_id).first()
        return _contact_to_entity(row) if row else None

    def list_by_customer(self, *, customer_id: str) -> list[Contact]:
        rows = ContactModel.objects.filter(customer_id=customer_id)
        return [_contact_to_entity(r) for r in rows]

    def update(self, *, contact: Contact) -> Contact:
        row = ContactModel.objects.get(id=contact.id)
        row.name = contact.name
        row.role = contact.role
        row.email = contact.email
        row.phone = contact.phone
        row.is_primary = contact.is_primary
        row.save()
        return _contact_to_entity(row)

    def clear_primary(self, *, customer_id: str, except_id: str | None = None) -> None:
        qs = ContactModel.objects.filter(customer_id=customer_id, is_primary=True)
        if except_id:
            qs = qs.exclude(id=except_id)
        qs.update(is_primary=False)

    def delete(self, *, contact_id: str) -> None:
        ContactModel.objects.filter(id=contact_id).delete()


class DjangoStageRepository(StageRepository):
    """Persistência dos estágios do funil via Django ORM."""

    def create(self, *, stage: PipelineStage) -> PipelineStage:
        row = PipelineStageModel.objects.create(
            workspace_id=stage.workspace_id,
            name=stage.name,
            slug=stage.slug,
            color=stage.color,
            order=stage.order,
            probability_default=stage.probability_default,
            kind=stage.kind.value,
        )
        return _stage_to_entity(row)

    def get(self, *, stage_id: str) -> PipelineStage | None:
        row = PipelineStageModel.objects.filter(id=stage_id).first()
        return _stage_to_entity(row) if row else None

    def list_by_workspace(self, *, workspace_id: str) -> list[PipelineStage]:
        rows = PipelineStageModel.objects.filter(workspace_id=workspace_id)
        return [_stage_to_entity(r) for r in rows]

    def find_by_kind(self, *, workspace_id: str, kind: StageKind) -> PipelineStage | None:
        row = PipelineStageModel.objects.filter(
            workspace_id=workspace_id, kind=kind.value
        ).first()
        return _stage_to_entity(row) if row else None

    def count_by_kind(self, *, workspace_id: str, kind: StageKind) -> int:
        return PipelineStageModel.objects.filter(
            workspace_id=workspace_id, kind=kind.value
        ).count()

    def slug_exists(self, *, workspace_id: str, slug: str) -> bool:
        return PipelineStageModel.objects.filter(
            workspace_id=workspace_id, slug=slug
        ).exists()

    def max_order(self, *, workspace_id: str) -> int:
        return (
            PipelineStageModel.objects.filter(workspace_id=workspace_id).aggregate(
                m=Max("order")
            )["m"]
            or 0
        )

    def update(self, *, stage: PipelineStage) -> PipelineStage:
        row = PipelineStageModel.objects.get(id=stage.id)
        row.name = stage.name
        row.slug = stage.slug
        row.color = stage.color
        row.order = stage.order
        row.probability_default = stage.probability_default
        row.kind = stage.kind.value
        row.save()
        return _stage_to_entity(row)

    def delete(self, *, stage_id: str) -> None:
        PipelineStageModel.objects.filter(id=stage_id).delete()


class DjangoDealRepository(DealRepository):
    """Persistência de negócios via Django ORM."""

    def create(self, *, deal: Deal) -> Deal:
        row = DealModel.objects.create(
            workspace_id=deal.workspace_id,
            title=deal.title,
            customer_id=deal.customer_id,
            contact_id=deal.contact_id,
            stage_id=deal.stage_id,
            amount=deal.amount,
            currency=deal.currency,
            probability=deal.probability,
            expected_close_date=deal.expected_close_date,
            source=deal.source,
            owner_id=deal.owner_id,
            rank=deal.rank,
        )
        row = DealModel.objects.select_related("customer").get(id=row.id)
        return _deal_to_entity(row)

    def get(self, *, deal_id: str) -> Deal | None:
        row = DealModel.objects.filter(id=deal_id).select_related("customer").first()
        return _deal_to_entity(row) if row else None

    def list_by_workspace(
        self,
        *,
        workspace_id: str,
        stage_id: str | None = None,
        customer_id: str | None = None,
        owner_id: str | None = None,
    ) -> list[Deal]:
        qs = DealModel.objects.filter(workspace_id=workspace_id).select_related("customer")
        if stage_id:
            qs = qs.filter(stage_id=stage_id)
        if customer_id:
            qs = qs.filter(customer_id=customer_id)
        if owner_id:
            qs = qs.filter(owner_id=owner_id)
        return [_deal_to_entity(r) for r in qs]

    def update(self, *, deal: Deal) -> Deal:
        row = DealModel.objects.select_related("customer").get(id=deal.id)
        row.title = deal.title
        row.customer_id = deal.customer_id
        row.contact_id = deal.contact_id
        row.stage_id = deal.stage_id
        row.amount = deal.amount
        row.currency = deal.currency
        row.probability = deal.probability
        row.expected_close_date = deal.expected_close_date
        row.source = deal.source
        row.owner_id = deal.owner_id
        row.lost_reason = deal.lost_reason
        row.lost_notes = deal.lost_notes
        row.won_at = deal.won_at
        row.lost_at = deal.lost_at
        row.delivery_project_id = deal.delivery_project_id
        row.rank = deal.rank
        row.save()
        return _deal_to_entity(row)

    def delete(self, *, deal_id: str) -> None:
        DealModel.objects.filter(id=deal_id).delete()

    def count_by_stage(self, *, stage_id: str) -> int:
        return DealModel.objects.filter(stage_id=stage_id).count()

    def last_rank_in_stage(self, *, workspace_id: str, stage_id: str) -> str:
        return (
            DealModel.objects.filter(
                workspace_id=workspace_id, stage_id=stage_id
            ).aggregate(m=Max("rank"))["m"]
            or ""
        )


class DjangoActivityRepository(ActivityRepository):
    """Persistência de atividades via Django ORM."""

    def create(self, *, activity: DealActivity) -> DealActivity:
        row = DealActivityModel.objects.create(
            deal_id=activity.deal_id,
            kind=activity.kind.value,
            content=activity.content,
            author_id=activity.author_id,
            due_date=activity.due_date,
            end_date=activity.end_date,
            assignee_id=activity.assignee_id,
            done_at=activity.done_at,
            google_event_id=activity.google_event_id,
            meet_url=activity.meet_url,
        )
        return _activity_to_entity(row)

    def get(self, *, activity_id: str) -> DealActivity | None:
        row = DealActivityModel.objects.filter(id=activity_id).first()
        return _activity_to_entity(row) if row else None

    def list_by_deal(self, *, deal_id: str) -> list[DealActivity]:
        rows = DealActivityModel.objects.filter(deal_id=deal_id)
        return [_activity_to_entity(r) for r in rows]

    def list_by_workspace(
        self,
        *,
        workspace_id: str,
        kind: str | None = None,
        assignee_id: str | None = None,
        pending_only: bool = False,
    ) -> list[DealActivity]:
        qs = DealActivityModel.objects.filter(deal__workspace_id=workspace_id)
        if kind:
            qs = qs.filter(kind=kind)
        if assignee_id:
            qs = qs.filter(assignee_id=assignee_id)
        if pending_only:
            qs = qs.filter(done_at__isnull=True)
        return [_activity_to_entity(r) for r in qs]

    def update(self, *, activity: DealActivity) -> DealActivity:
        row = DealActivityModel.objects.get(id=activity.id)
        row.content = activity.content
        row.due_date = activity.due_date
        row.end_date = activity.end_date
        row.assignee_id = activity.assignee_id
        row.done_at = activity.done_at
        row.google_event_id = activity.google_event_id
        row.meet_url = activity.meet_url
        row.save()
        return _activity_to_entity(row)

    def delete(self, *, activity_id: str) -> None:
        DealActivityModel.objects.filter(id=activity_id).delete()


class DjangoDealHistoryRepository(DealHistoryRepository):
    """Persistência do histórico de negócios via Django ORM."""

    def record(
        self,
        *,
        deal_id: str,
        author_id: str | None,
        field: str,
        from_value: str,
        to_value: str,
    ) -> DealHistoryEntry:
        row = DealHistoryModel.objects.create(
            deal_id=deal_id,
            author_id=author_id,
            field=field,
            from_value=from_value,
            to_value=to_value,
        )
        return _history_to_entity(row)

    def list_by_deal(self, *, deal_id: str) -> list[DealHistoryEntry]:
        rows = DealHistoryModel.objects.filter(deal_id=deal_id).select_related("author")
        return [_history_to_entity(r) for r in rows]
