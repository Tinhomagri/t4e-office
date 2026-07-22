// Camada HTTP do contexto Comercial. Mesmo padrão de workspace.api.ts: funções
// finas sobre o client axios, tipadas, sem lógica de cache (isso é dos hooks).
import { api } from "@/shared/api/client"

import type {
  ActivityActionResult,
  Contact,
  CreateActivityInput,
  CreateStageInput,
  CreateContactInput,
  CreateCustomerInput,
  CreateDealInput,
  Customer,
  Deal,
  DealActionResult,
  DealActivity,
  DealHistoryEntry,
  LoseDealInput,
  PipelineStage,
  UpdateContactInput,
  UpdateCustomerInput,
  UpdateDealInput,
  WinDealInput,
  WorkspaceActivityFilters,
} from "./sales.types"

// ---- Estágios do funil ----
export async function listStages(workspaceId: string): Promise<PipelineStage[]> {
  const { data } = await api.get<PipelineStage[]>("/sales/stages/", {
    params: { workspace_id: workspaceId },
  })
  return data
}

export async function updateStage(
  stageId: string,
  input: Partial<Pick<PipelineStage, "name" | "color" | "order" | "probability_default">>,
): Promise<PipelineStage> {
  const { data } = await api.patch<PipelineStage>(`/sales/stages/${stageId}/`, input)
  return data
}

export async function createStage(
  workspaceId: string,
  input: CreateStageInput,
): Promise<PipelineStage> {
  const { data } = await api.post<PipelineStage>("/sales/stages/", {
    workspace_id: workspaceId,
    ...input,
  })
  return data
}

/** Remove o estágio. O backend recusa (409) se ainda houver negócios nele. */
export async function deleteStage(stageId: string): Promise<void> {
  await api.delete(`/sales/stages/${stageId}/`)
}

// ---- Clientes ----
export async function listCustomers(workspaceId: string, search?: string): Promise<Customer[]> {
  const { data } = await api.get<Customer[]>("/sales/customers/", {
    params: { workspace_id: workspaceId, ...(search ? { search } : {}) },
  })
  return data
}

export async function createCustomer(
  workspaceId: string,
  input: CreateCustomerInput,
): Promise<Customer> {
  const { data } = await api.post<Customer>("/sales/customers/", {
    workspace_id: workspaceId,
    ...input,
  })
  return data
}

export async function updateCustomer(
  customerId: string,
  input: UpdateCustomerInput,
): Promise<Customer> {
  const { data } = await api.patch<Customer>(`/sales/customers/${customerId}/`, input)
  return data
}

export async function deleteCustomer(customerId: string): Promise<void> {
  await api.delete(`/sales/customers/${customerId}/`)
}

// ---- Contatos ----
export async function listContacts(customerId: string): Promise<Contact[]> {
  const { data } = await api.get<Contact[]>(`/sales/customers/${customerId}/contacts/`)
  return data
}

export async function createContact(
  customerId: string,
  input: CreateContactInput,
): Promise<Contact> {
  const { data } = await api.post<Contact>(`/sales/customers/${customerId}/contacts/`, input)
  return data
}

export async function updateContact(
  contactId: string,
  input: UpdateContactInput,
): Promise<Contact> {
  const { data } = await api.patch<Contact>(`/sales/contacts/${contactId}/`, input)
  return data
}

export async function deleteContact(contactId: string): Promise<void> {
  await api.delete(`/sales/contacts/${contactId}/`)
}

// ---- Deals ----
export async function listDeals(workspaceId: string, customerId?: string): Promise<Deal[]> {
  const { data } = await api.get<Deal[]>("/sales/deals/", {
    params: { workspace_id: workspaceId, ...(customerId ? { customer_id: customerId } : {}) },
  })
  return data
}

export async function createDeal(workspaceId: string, input: CreateDealInput): Promise<Deal> {
  const { data } = await api.post<Deal>("/sales/deals/", {
    workspace_id: workspaceId,
    ...input,
  })
  return data
}

export async function updateDeal(dealId: string, input: UpdateDealInput): Promise<Deal> {
  const { data } = await api.patch<Deal>(`/sales/deals/${dealId}/`, input)
  return data
}

export async function deleteDeal(dealId: string): Promise<void> {
  await api.delete(`/sales/deals/${dealId}/`)
}

/**
 * Move o deal de estágio (o backend decide a probabilidade e grava histórico).
 * Os vizinhos posicionam o card na coluna; sem eles ele vai para o fim. Informar
 * vizinho com o mesmo estágio de origem é reordenação — não gera histórico.
 */
export async function moveDealStage(
  dealId: string,
  stageId: string,
  neighbors: { previousDealId?: string | null; nextDealId?: string | null } = {},
): Promise<Deal> {
  const { data } = await api.post<Deal>(`/sales/deals/${dealId}/move/`, {
    stage_id: stageId,
    ...(neighbors.previousDealId ? { previous_deal_id: neighbors.previousDealId } : {}),
    ...(neighbors.nextDealId ? { next_deal_id: neighbors.nextDealId } : {}),
  })
  return data
}

export async function winDeal(dealId: string, input: WinDealInput): Promise<DealActionResult> {
  const { data } = await api.post<DealActionResult>(`/sales/deals/${dealId}/win/`, input)
  return data
}

export async function loseDeal(dealId: string, input: LoseDealInput): Promise<DealActionResult> {
  const { data } = await api.post<DealActionResult>(`/sales/deals/${dealId}/lose/`, input)
  return data
}

// ---- Atividades e histórico ----
export async function listDealActivities(dealId: string): Promise<DealActivity[]> {
  const { data } = await api.get<DealActivity[]>(`/sales/deals/${dealId}/activities/`)
  return data
}

export async function listWorkspaceActivities(
  workspaceId: string,
  filters: WorkspaceActivityFilters = {},
): Promise<DealActivity[]> {
  const { data } = await api.get<DealActivity[]>("/sales/activities/", {
    params: {
      workspace_id: workspaceId,
      // Só enviamos os filtros preenchidos — o backend trata ausência como "todos".
      ...(filters.kind ? { kind: filters.kind } : {}),
      ...(filters.assigneeId ? { assignee_id: filters.assigneeId } : {}),
      ...(filters.pending ? { pending: true } : {}),
    },
  })
  return data
}

export async function createActivity(
  dealId: string,
  input: CreateActivityInput,
): Promise<ActivityActionResult> {
  const { data } = await api.post<ActivityActionResult>(
    `/sales/deals/${dealId}/activities/`,
    input,
  )
  return data
}

export async function toggleActivityDone(
  activityId: string,
  done: boolean,
): Promise<DealActivity> {
  const { data } = await api.patch<DealActivity>(`/sales/activities/${activityId}/`, {
    done_at: done ? new Date().toISOString() : null,
  })
  return data
}

export async function deleteActivity(activityId: string): Promise<void> {
  await api.delete(`/sales/activities/${activityId}/`)
}

export async function listDealHistory(dealId: string): Promise<DealHistoryEntry[]> {
  const { data } = await api.get<DealHistoryEntry[]>(`/sales/deals/${dealId}/history/`)
  return data
}
