"""Implementação Django do repositório de leads."""
from django.db.models import Q

from contexts.sales.domain.entities.lead import Lead, LeadStatus
from contexts.sales.domain.repositories.lead_repository import LeadRepository
from contexts.sales.infrastructure.django.models import LeadModel


def _to_entity(row: LeadModel) -> Lead:
    return Lead(
        id=str(row.id),
        workspace_id=str(row.workspace_id),
        name=row.name,
        company=row.company,
        email=row.email,
        phone=row.phone,
        source=row.source,
        score=row.score,
        status=LeadStatus(row.status),
        disqualify_reason=row.disqualify_reason,
        owner_id=str(row.owner_id) if row.owner_id else None,
        notes=row.notes,
        first_contact_due_at=row.first_contact_due_at,
        contacted_at=row.contacted_at,
        converted_at=row.converted_at,
        converted_deal_id=str(row.converted_deal_id) if row.converted_deal_id else None,
        converted_customer_id=(
            str(row.converted_customer_id) if row.converted_customer_id else None
        ),
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


class DjangoLeadRepository(LeadRepository):
    """Persistência de leads via Django ORM."""

    def create(self, *, lead: Lead) -> Lead:
        row = LeadModel.objects.create(
            workspace_id=lead.workspace_id,
            name=lead.name,
            company=lead.company,
            email=lead.email,
            phone=lead.phone,
            source=lead.source,
            score=lead.score,
            status=lead.status.value,
            disqualify_reason=lead.disqualify_reason,
            owner_id=lead.owner_id,
            notes=lead.notes,
            first_contact_due_at=lead.first_contact_due_at,
        )
        return _to_entity(row)

    def bulk_create(self, *, leads: list[Lead]) -> list[Lead]:
        if not leads:
            return []
        # O UUID de cada linha é gerado em Python (default=uuid.uuid4) ao
        # construir o LeadModel, não pelo banco — então já sabemos os ids antes
        # do bulk_create e podemos recarregar por eles. Reordenar por
        # created_at seria racy sob importações concorrentes; por id, não.
        rows = [
            LeadModel(
                workspace_id=lead.workspace_id,
                name=lead.name,
                company=lead.company,
                email=lead.email,
                phone=lead.phone,
                source=lead.source,
                score=lead.score,
                status=lead.status.value,
                owner_id=lead.owner_id,
                first_contact_due_at=lead.first_contact_due_at,
            )
            for lead in leads
        ]
        LeadModel.objects.bulk_create(rows)
        created = LeadModel.objects.filter(id__in=[row.id for row in rows])
        by_id = {str(row.id): row for row in created}
        # Preserva a ordem de entrada (a ordem do CSV) em vez da ordem do banco.
        return [_to_entity(by_id[str(row.id)]) for row in rows]

    def get(self, *, lead_id: str) -> Lead | None:
        row = LeadModel.objects.filter(id=lead_id).first()
        return _to_entity(row) if row else None

    def list_by_workspace(
        self,
        *,
        workspace_id: str,
        status: LeadStatus | None = None,
        owner_id: str | None = None,
        search: str = "",
        overdue_only: bool = False,
    ) -> list[Lead]:
        qs = LeadModel.objects.filter(workspace_id=workspace_id)
        if status:
            qs = qs.filter(status=status.value)
        if owner_id:
            qs = qs.filter(owner_id=owner_id)
        if search:
            qs = qs.filter(
                Q(name__icontains=search)
                | Q(company__icontains=search)
                | Q(email__icontains=search)
            )
        leads = [_to_entity(row) for row in qs]
        if overdue_only:
            leads = [lead for lead in leads if lead.is_overdue]
        return leads

    def update(self, *, lead: Lead) -> Lead:
        row = LeadModel.objects.get(id=lead.id)
        row.name = lead.name
        row.company = lead.company
        row.email = lead.email
        row.phone = lead.phone
        row.source = lead.source
        row.score = lead.score
        row.status = lead.status.value
        row.disqualify_reason = lead.disqualify_reason
        row.owner_id = lead.owner_id
        row.notes = lead.notes
        row.first_contact_due_at = lead.first_contact_due_at
        row.contacted_at = lead.contacted_at
        row.converted_at = lead.converted_at
        row.converted_deal_id = lead.converted_deal_id
        row.converted_customer_id = lead.converted_customer_id
        row.save()
        return _to_entity(row)

    def delete(self, *, lead_id: str) -> None:
        LeadModel.objects.filter(id=lead_id).delete()
