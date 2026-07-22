// Hooks do comercial — react-query no mesmo padrão de workspace.hooks.ts:
// queryKey por escopo, invalidação explícita no onSuccess e toast nas ações
// que o usuário precisa ver confirmadas.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { toast } from "@/shared/ui/toast"

import * as salesApi from "./sales.api"
import { nextProbability, sortStages } from "./sales.shared"
import type {
  CreateActivityInput,
  CreateContactInput,
  CreateCustomerInput,
  CreateDealInput,
  Deal,
  LoseDealInput,
  UpdateContactInput,
  UpdateCustomerInput,
  UpdateDealInput,
  WinDealInput,
  WorkspaceActivityFilters,
} from "./sales.types"

// Chaves de cache centralizadas — evita divergência entre hooks.
export const salesKeys = {
  stages: (workspaceId: string | null) => ["sales-stages", workspaceId] as const,
  customers: (workspaceId: string | null, search?: string) =>
    ["sales-customers", workspaceId, search ?? ""] as const,
  contacts: (customerId: string | null) => ["sales-contacts", customerId] as const,
  deals: (workspaceId: string | null, customerId?: string | null) =>
    ["sales-deals", workspaceId, customerId ?? null] as const,
  activities: (dealId: string | null) => ["sales-activities", dealId] as const,
  workspaceActivities: (workspaceId: string | null, filters?: WorkspaceActivityFilters) =>
    [
      "sales-workspace-activities",
      workspaceId,
      filters?.kind ?? null,
      filters?.assigneeId ?? null,
      filters?.pending ?? false,
    ] as const,
  history: (dealId: string | null) => ["sales-deal-history", dealId] as const,
}

// ---- Estágios ----
export function useStages(workspaceId: string | null) {
  return useQuery({
    queryKey: salesKeys.stages(workspaceId),
    queryFn: async () => sortStages(await salesApi.listStages(workspaceId!)),
    enabled: !!workspaceId,
    staleTime: 60_000,
  })
}

// ---- Clientes ----
export function useCustomers(workspaceId: string | null, search?: string) {
  return useQuery({
    queryKey: salesKeys.customers(workspaceId, search),
    queryFn: () => salesApi.listCustomers(workspaceId!, search),
    enabled: !!workspaceId,
  })
}

export function useCreateCustomer(workspaceId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateCustomerInput) => salesApi.createCustomer(workspaceId!, input),
    onSuccess: (customer) => {
      qc.invalidateQueries({ queryKey: ["sales-customers", workspaceId] })
      toast.success(`Cliente "${customer.name}" criado`)
    },
  })
}

export function useUpdateCustomer(workspaceId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ customerId, input }: { customerId: string; input: UpdateCustomerInput }) =>
      salesApi.updateCustomer(customerId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sales-customers", workspaceId] }),
  })
}

export function useDeleteCustomer(workspaceId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (customerId: string) => salesApi.deleteCustomer(customerId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales-customers", workspaceId] })
      toast.success("Cliente removido")
    },
  })
}

// ---- Contatos ----
export function useContacts(customerId: string | null) {
  return useQuery({
    queryKey: salesKeys.contacts(customerId),
    queryFn: () => salesApi.listContacts(customerId!),
    enabled: !!customerId,
  })
}

export function useCreateContact(customerId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateContactInput) => salesApi.createContact(customerId!, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: salesKeys.contacts(customerId) }),
  })
}

export function useUpdateContact(customerId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ contactId, input }: { contactId: string; input: UpdateContactInput }) =>
      salesApi.updateContact(contactId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: salesKeys.contacts(customerId) }),
  })
}

export function useDeleteContact(customerId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (contactId: string) => salesApi.deleteContact(contactId),
    onSuccess: () => qc.invalidateQueries({ queryKey: salesKeys.contacts(customerId) }),
  })
}

// ---- Deals ----
export function useDeals(workspaceId: string | null, customerId?: string | null) {
  return useQuery({
    queryKey: salesKeys.deals(workspaceId, customerId),
    queryFn: () => salesApi.listDeals(workspaceId!, customerId ?? undefined),
    enabled: !!workspaceId,
  })
}

export function useCreateDeal(workspaceId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateDealInput) => salesApi.createDeal(workspaceId!, input),
    onSuccess: (deal) => {
      qc.invalidateQueries({ queryKey: ["sales-deals", workspaceId] })
      toast.success(`Negócio "${deal.title}" criado`)
    },
  })
}

export function useUpdateDeal(workspaceId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ dealId, input }: { dealId: string; input: UpdateDealInput }) =>
      salesApi.updateDeal(dealId, input),
    onSuccess: (_deal, { dealId }) => {
      qc.invalidateQueries({ queryKey: ["sales-deals", workspaceId] })
      qc.invalidateQueries({ queryKey: salesKeys.history(dealId) })
    },
  })
}

export function useDeleteDeal(workspaceId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dealId: string) => salesApi.deleteDeal(dealId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales-deals", workspaceId] })
      toast.success("Negócio removido")
    },
  })
}

/**
 * Move o deal entre colunas do Kanban com update otimista: o card precisa
 * assentar na nova coluna no mesmo frame do drop, senão o movimento "volta"
 * enquanto a request viaja. Em caso de erro, o cache anterior é restaurado.
 */
export function useMoveDealStage(workspaceId: string | null) {
  const qc = useQueryClient()
  const key = salesKeys.deals(workspaceId)

  return useMutation({
    mutationFn: ({ dealId, stageId }: { dealId: string; stageId: string; rank?: string }) =>
      salesApi.moveDealStage(dealId, stageId),
    onMutate: async ({ dealId, stageId }) => {
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<Deal[]>(key)
      const stages = qc.getQueryData<ReturnType<typeof sortStages>>(
        salesKeys.stages(workspaceId),
      )
      qc.setQueryData<Deal[]>(key, (old) =>
        (old ?? []).map((d) => {
          if (d.id !== dealId) return d
          const to = stages?.find((s) => s.id === stageId)
          const from = stages?.find((s) => s.id === d.stage_id)
          return {
            ...d,
            stage_id: stageId,
            probability: to ? nextProbability(d.probability, from, to) : d.probability,
          }
        }),
      )
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["sales-deals", workspaceId] }),
  })
}

export function useWinDeal(workspaceId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ dealId, input }: { dealId: string; input: WinDealInput }) =>
      salesApi.winDeal(dealId, input),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["sales-deals", workspaceId] })
      qc.invalidateQueries({ queryKey: ["projects", workspaceId] })
      if (result.warning) toast.info(result.warning)
      else toast.success("Negócio marcado como ganho")
    },
  })
}

export function useLoseDeal(workspaceId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ dealId, input }: { dealId: string; input: LoseDealInput }) =>
      salesApi.loseDeal(dealId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales-deals", workspaceId] })
      toast.info("Negócio marcado como perdido")
    },
  })
}

// ---- Atividades ----
export function useDealActivities(dealId: string | null) {
  return useQuery({
    queryKey: salesKeys.activities(dealId),
    queryFn: () => salesApi.listDealActivities(dealId!),
    enabled: !!dealId,
  })
}

export function useWorkspaceActivities(
  workspaceId: string | null,
  filters: WorkspaceActivityFilters = {},
) {
  return useQuery({
    queryKey: salesKeys.workspaceActivities(workspaceId, filters),
    queryFn: () => salesApi.listWorkspaceActivities(workspaceId!, filters),
    enabled: !!workspaceId,
  })
}

export function useCreateActivity(dealId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateActivityInput) => salesApi.createActivity(dealId!, input),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: salesKeys.activities(dealId) })
      qc.invalidateQueries({ queryKey: ["sales-workspace-activities"] })
      // Reunião registrada sem evento no Google (conta não conectada, API fora).
      if (result.warning) toast.info(result.warning)
    },
  })
}

export function useToggleActivity(dealId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ activityId, done }: { activityId: string; done: boolean }) =>
      salesApi.toggleActivityDone(activityId, done),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: salesKeys.activities(dealId) })
      qc.invalidateQueries({ queryKey: ["sales-workspace-activities"] })
    },
  })
}

export function useDealHistory(dealId: string | null) {
  return useQuery({
    queryKey: salesKeys.history(dealId),
    queryFn: () => salesApi.listDealHistory(dealId!),
    enabled: !!dealId,
  })
}
