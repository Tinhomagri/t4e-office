// Hooks de Leads — react-query no padrão de proposals.hooks.ts.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { toast } from "@/shared/ui/toast"

import * as leadsApi from "./leads.api"
import type { ListLeadsParams } from "./leads.api"
import { salesKeys } from "./sales.hooks"
import type { ConvertLeadInput, CreateLeadInput, UpdateLeadInput } from "./leads.types"

export const leadKeys = {
  list: (workspaceId: string | null, params: ListLeadsParams = {}) =>
    ["sales-leads", workspaceId, params] as const,
  detail: (leadId: string | null) => ["sales-lead", leadId] as const,
}

export function useLeads(workspaceId: string | null, params: ListLeadsParams = {}) {
  return useQuery({
    queryKey: leadKeys.list(workspaceId, params),
    queryFn: () => leadsApi.listLeads(workspaceId as string, params),
    enabled: Boolean(workspaceId),
  })
}

export function useCreateLead(workspaceId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateLeadInput) => leadsApi.createLead(workspaceId as string, input),
    onSuccess: (lead) => {
      qc.invalidateQueries({ queryKey: ["sales-leads", workspaceId] })
      toast.success(`Lead "${lead.name}" captado.`)
    },
  })
}

export function useUpdateLead(workspaceId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateLeadInput }) =>
      leadsApi.updateLead(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales-leads", workspaceId] })
      toast.success("Lead atualizado.")
    },
  })
}

export function useDeleteLead(workspaceId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (leadId: string) => leadsApi.deleteLead(leadId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales-leads", workspaceId] })
      toast.success("Lead removido.")
    },
  })
}

export function useImportLeadsCsv(workspaceId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (csvText: string) => leadsApi.importLeadsCsv(workspaceId as string, csvText),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["sales-leads", workspaceId] })
      const errCount = result.errors.length
      toast.success(
        errCount > 0
          ? `${result.imported.length} lead(s) importado(s), ${errCount} linha(s) com erro.`
          : `${result.imported.length} lead(s) importado(s).`,
      )
    },
  })
}

export function useMarkLeadContacted(workspaceId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (leadId: string) => leadsApi.markLeadContacted(leadId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales-leads", workspaceId] })
      toast.success("Primeiro contato registrado.")
    },
  })
}

export function useQualifyLead(workspaceId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, score }: { id: string; score: number }) => leadsApi.qualifyLead(id, score),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales-leads", workspaceId] })
      toast.success("Lead qualificado.")
    },
  })
}

export function useDisqualifyLead(workspaceId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      leadsApi.disqualifyLead(id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales-leads", workspaceId] })
      toast.success("Lead desqualificado.")
    },
  })
}

/**
 * Conversão. Invalida também clientes e negócios — a tela pode navegar direto
 * para o negócio recém-criado usando `deal_id` do resultado.
 */
export function useConvertLead(workspaceId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ConvertLeadInput }) =>
      leadsApi.convertLead(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales-leads", workspaceId] })
      qc.invalidateQueries({ queryKey: salesKeys.deals(workspaceId) })
      qc.invalidateQueries({ queryKey: ["sales-customers", workspaceId] })
      toast.success(`Lead convertido: negócio criado.`)
    },
  })
}
