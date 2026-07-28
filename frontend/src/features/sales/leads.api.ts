// Camada HTTP de Leads.
import { api } from "@/shared/api/client"

import type {
  ConvertLeadInput,
  ConvertLeadResult,
  CreateLeadInput,
  ImportLeadsResult,
  Lead,
  LeadStatus,
  UpdateLeadInput,
} from "./leads.types"

export interface ListLeadsParams {
  status?: LeadStatus
  ownerId?: string
  search?: string
  overdueOnly?: boolean
}

export async function listLeads(workspaceId: string, params: ListLeadsParams = {}): Promise<Lead[]> {
  const { data } = await api.get<Lead[]>("/sales/leads/", {
    params: {
      workspace_id: workspaceId,
      status: params.status,
      owner_id: params.ownerId,
      search: params.search || undefined,
      overdue: params.overdueOnly ? "true" : undefined,
    },
  })
  return data
}

export async function getLead(leadId: string): Promise<Lead> {
  const { data } = await api.get<Lead>(`/sales/leads/${leadId}/`)
  return data
}

export async function createLead(workspaceId: string, input: CreateLeadInput): Promise<Lead> {
  const { data } = await api.post<Lead>("/sales/leads/", {
    workspace_id: workspaceId,
    ...input,
  })
  return data
}

export async function updateLead(leadId: string, input: UpdateLeadInput): Promise<Lead> {
  const { data } = await api.patch<Lead>(`/sales/leads/${leadId}/`, input)
  return data
}

export async function deleteLead(leadId: string): Promise<void> {
  await api.delete(`/sales/leads/${leadId}/`)
}

export async function importLeadsCsv(workspaceId: string, csvText: string): Promise<ImportLeadsResult> {
  const { data } = await api.post<ImportLeadsResult>("/sales/leads/import/", {
    workspace_id: workspaceId,
    csv_text: csvText,
  })
  return data
}

export async function markLeadContacted(leadId: string): Promise<Lead> {
  const { data } = await api.post<Lead>(`/sales/leads/${leadId}/contacted/`)
  return data
}

export async function qualifyLead(leadId: string, score: number): Promise<Lead> {
  const { data } = await api.post<Lead>(`/sales/leads/${leadId}/qualify/`, { score })
  return data
}

export async function disqualifyLead(leadId: string, reason: string): Promise<Lead> {
  const { data } = await api.post<Lead>(`/sales/leads/${leadId}/disqualify/`, { reason })
  return data
}

export async function convertLead(leadId: string, input: ConvertLeadInput): Promise<ConvertLeadResult> {
  const { data } = await api.post<ConvertLeadResult>(`/sales/leads/${leadId}/convert/`, input)
  return data
}
