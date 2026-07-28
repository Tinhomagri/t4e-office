"""Casos de uso de captação, qualificação e conversão de leads."""
import csv
import io
from dataclasses import dataclass, field

from contexts.sales.application.use_cases._access import assert_workspace_member
from contexts.sales.application.use_cases.manage_customers import CreateCustomer
from contexts.sales.application.use_cases.manage_deals import CreateDeal
from contexts.sales.domain.entities.customer import CustomerKind
from contexts.sales.domain.entities.lead import Lead, LeadStatus
from contexts.sales.domain.repositories.customer_repository import (
    CustomerRepository,
    WorkspaceAccess,
)
from contexts.sales.domain.repositories.deal_repository import DealRepository
from contexts.sales.domain.repositories.lead_repository import LeadRepository
from contexts.sales.domain.repositories.stage_repository import StageRepository
from shared.domain.errors import NotFoundError

# Colunas aceitas na importação CSV. `name` é a única obrigatória — uma
# planilha exportada de qualquer CRM/formulário costuma ter pelo menos isso.
_CSV_FIELDS = ("name", "company", "email", "phone", "source")


class CreateLead:
    """Capta um lead manualmente."""

    def __init__(
        self,
        lead_repository: LeadRepository,
        workspace_access: WorkspaceAccess,
    ):
        self.lead_repository = lead_repository
        self.workspace_access = workspace_access

    def execute(self, *, workspace_id: str, actor_id: str, **data) -> Lead:
        assert_workspace_member(
            self.workspace_access, workspace_id=workspace_id, actor_id=actor_id
        )
        return self.lead_repository.create(
            lead=Lead(
                id=None,
                workspace_id=workspace_id,
                name=data.get("name", ""),
                company=data.get("company", "") or "",
                email=data.get("email", "") or "",
                phone=data.get("phone", "") or "",
                source=data.get("source", "") or "manual",
                owner_id=data.get("owner_id") or actor_id,
                notes=data.get("notes", "") or "",
            )
        )


@dataclass
class ImportLeadsResult:
    """Resultado da importação: o que entrou e o que foi rejeitado, linha a linha.

    Uma importação parcial nunca falha por inteiro — uma linha ruim no meio de
    200 não pode derrubar as outras 199.
    """

    imported: list[Lead] = field(default_factory=list)
    errors: list[dict] = field(default_factory=list)  # [{"row": int, "reason": str}]


class ImportLeadsCsv:
    """Importa leads em lote a partir de um CSV (texto puro, sem upload de arquivo)."""

    def __init__(
        self,
        lead_repository: LeadRepository,
        workspace_access: WorkspaceAccess,
    ):
        self.lead_repository = lead_repository
        self.workspace_access = workspace_access

    def execute(
        self, *, workspace_id: str, actor_id: str, csv_text: str
    ) -> ImportLeadsResult:
        assert_workspace_member(
            self.workspace_access, workspace_id=workspace_id, actor_id=actor_id
        )

        reader = csv.DictReader(io.StringIO(csv_text.strip()))
        result = ImportLeadsResult()
        to_create: list[Lead] = []

        for row_num, row in enumerate(reader, start=2):  # linha 1 = cabeçalho
            normalized = {
                k: (row.get(k) or "").strip() for k in _CSV_FIELDS if k in row
            }
            try:
                lead = Lead(
                    id=None,
                    workspace_id=workspace_id,
                    name=normalized.get("name", ""),
                    company=normalized.get("company", ""),
                    email=normalized.get("email", ""),
                    phone=normalized.get("phone", ""),
                    source=normalized.get("source") or "csv_import",
                    owner_id=actor_id,
                )
            except Exception as exc:  # ValidationError da entidade — linha inválida
                result.errors.append({"row": row_num, "reason": str(exc)})
                continue
            to_create.append(lead)

        if to_create:
            result.imported = self.lead_repository.bulk_create(leads=to_create)
        return result


class ListLeads:
    """Lista os leads do workspace — a fila de trabalho por responsável."""

    def __init__(
        self,
        lead_repository: LeadRepository,
        workspace_access: WorkspaceAccess,
    ):
        self.lead_repository = lead_repository
        self.workspace_access = workspace_access

    def execute(
        self,
        *,
        workspace_id: str,
        actor_id: str,
        status: str | None = None,
        owner_id: str | None = None,
        search: str = "",
        overdue_only: bool = False,
    ) -> list[Lead]:
        assert_workspace_member(
            self.workspace_access, workspace_id=workspace_id, actor_id=actor_id
        )
        return self.lead_repository.list_by_workspace(
            workspace_id=workspace_id,
            status=LeadStatus(status) if status else None,
            owner_id=owner_id,
            search=search,
            overdue_only=overdue_only,
        )


class GetLead:
    """Busca um lead garantindo o acesso ao workspace dono."""

    def __init__(
        self,
        lead_repository: LeadRepository,
        workspace_access: WorkspaceAccess,
    ):
        self.lead_repository = lead_repository
        self.workspace_access = workspace_access

    def execute(self, *, lead_id: str, actor_id: str) -> Lead:
        lead = self.lead_repository.get(lead_id=lead_id)
        if lead is None:
            raise NotFoundError("Lead não encontrado.")
        assert_workspace_member(
            self.workspace_access, workspace_id=lead.workspace_id, actor_id=actor_id
        )
        return lead


class UpdateLead:
    """Atualiza os dados de contato de um lead (não o status — ver ações dedicadas)."""

    _FIELDS = ("name", "company", "email", "phone", "source", "owner_id", "notes")

    def __init__(
        self,
        lead_repository: LeadRepository,
        workspace_access: WorkspaceAccess,
    ):
        self.lead_repository = lead_repository
        self.workspace_access = workspace_access

    def execute(self, *, lead_id: str, actor_id: str, **changes) -> Lead:
        lead = GetLead(self.lead_repository, self.workspace_access).execute(
            lead_id=lead_id, actor_id=actor_id
        )
        for f in self._FIELDS:
            if changes.get(f) is not None:
                setattr(lead, f, changes[f])
        lead.__post_init__()
        return self.lead_repository.update(lead=lead)


class MarkLeadContacted:
    """Registra o primeiro (ou próximo) contato — encerra o relógio do SLA."""

    def __init__(
        self,
        lead_repository: LeadRepository,
        workspace_access: WorkspaceAccess,
    ):
        self.lead_repository = lead_repository
        self.workspace_access = workspace_access

    def execute(self, *, lead_id: str, actor_id: str) -> Lead:
        lead = GetLead(self.lead_repository, self.workspace_access).execute(
            lead_id=lead_id, actor_id=actor_id
        )
        lead.mark_contacted()
        return self.lead_repository.update(lead=lead)


class QualifyLead:
    """Atribui score e move o lead para qualificado."""

    def __init__(
        self,
        lead_repository: LeadRepository,
        workspace_access: WorkspaceAccess,
    ):
        self.lead_repository = lead_repository
        self.workspace_access = workspace_access

    def execute(self, *, lead_id: str, actor_id: str, score: int) -> Lead:
        lead = GetLead(self.lead_repository, self.workspace_access).execute(
            lead_id=lead_id, actor_id=actor_id
        )
        lead.qualify(score=score)
        return self.lead_repository.update(lead=lead)


class DisqualifyLead:
    """Descarta o lead com motivo — sai da esteira sem virar negócio."""

    def __init__(
        self,
        lead_repository: LeadRepository,
        workspace_access: WorkspaceAccess,
    ):
        self.lead_repository = lead_repository
        self.workspace_access = workspace_access

    def execute(self, *, lead_id: str, actor_id: str, reason: str) -> Lead:
        lead = GetLead(self.lead_repository, self.workspace_access).execute(
            lead_id=lead_id, actor_id=actor_id
        )
        lead.disqualify(reason=reason)
        return self.lead_repository.update(lead=lead)


class DeleteLead:
    """Remove um lead."""

    def __init__(
        self,
        lead_repository: LeadRepository,
        workspace_access: WorkspaceAccess,
    ):
        self.lead_repository = lead_repository
        self.workspace_access = workspace_access

    def execute(self, *, lead_id: str, actor_id: str) -> None:
        GetLead(self.lead_repository, self.workspace_access).execute(
            lead_id=lead_id, actor_id=actor_id
        )
        self.lead_repository.delete(lead_id=lead_id)


@dataclass
class ConvertLeadResult:
    lead: Lead
    customer_id: str
    deal_id: str


class ConvertLead:
    """Converte um lead em cliente + negócio, sem redigitar nenhum dado.

    Reaproveita `CreateCustomer` e `CreateDeal` do próprio contexto — a
    conversão não é um caminho especial de gravação, é a composição dos dois
    casos de uso que já existem para cadastro manual.
    """

    def __init__(
        self,
        lead_repository: LeadRepository,
        customer_repository: CustomerRepository,
        deal_repository: DealRepository,
        stage_repository: StageRepository,
        workspace_access: WorkspaceAccess,
    ):
        self.lead_repository = lead_repository
        self.customer_repository = customer_repository
        self.deal_repository = deal_repository
        self.stage_repository = stage_repository
        self.workspace_access = workspace_access

    def execute(
        self, *, lead_id: str, actor_id: str, deal_title: str = "", amount: str = "0"
    ) -> ConvertLeadResult:
        lead = GetLead(self.lead_repository, self.workspace_access).execute(
            lead_id=lead_id, actor_id=actor_id
        )
        lead.assert_convertible()

        customer = CreateCustomer(
            self.customer_repository, self.workspace_access
        ).execute(
            workspace_id=lead.workspace_id,
            actor_id=actor_id,
            name=lead.company or lead.name,
            kind=(CustomerKind.COMPANY if lead.company else CustomerKind.PERSON).value,
            email=lead.email,
            phone=lead.phone,
            owner_id=lead.owner_id or actor_id,
            notes=lead.notes,
        )

        deal = CreateDeal(
            self.deal_repository,
            self.stage_repository,
            self.customer_repository,
            self.workspace_access,
        ).execute(
            workspace_id=lead.workspace_id,
            actor_id=actor_id,
            title=deal_title or f"Negócio — {lead.name}",
            customer_id=customer.id,
            amount=amount,
            source=lead.source,
            owner_id=lead.owner_id or actor_id,
        )

        lead.mark_converted(deal_id=str(deal.id), customer_id=str(customer.id))
        updated = self.lead_repository.update(lead=lead)
        return ConvertLeadResult(
            lead=updated, customer_id=str(customer.id), deal_id=str(deal.id)
        )
