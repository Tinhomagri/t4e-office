// Hooks das Propostas — react-query no padrão de sales.hooks.ts.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { toast } from "@/shared/ui/toast"

import * as proposalsApi from "./proposals.api"
import { salesKeys } from "./sales.hooks"
import type {
  CreateProposalInput,
  SendProposalInput,
  UpdateProposalInput,
} from "./proposals.types"

export const proposalKeys = {
  list: (workspaceId: string | null, dealId?: string | null) =>
    ["sales-proposals", workspaceId, dealId ?? null] as const,
  detail: (proposalId: string | null) => ["sales-proposal", proposalId] as const,
}

export function useProposals(workspaceId: string | null, dealId?: string | null) {
  return useQuery({
    queryKey: proposalKeys.list(workspaceId, dealId),
    queryFn: () => proposalsApi.listProposals(workspaceId as string, dealId ?? undefined),
    enabled: Boolean(workspaceId),
  })
}

export function useCreateProposal(workspaceId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateProposalInput) =>
      proposalsApi.createProposal(workspaceId as string, input),
    onSuccess: (proposal) => {
      qc.invalidateQueries({ queryKey: ["sales-proposals", workspaceId] })
      toast.success(`Proposta nº ${proposal.number} criada.`)
    },
  })
}

export function useUpdateProposal(workspaceId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateProposalInput }) =>
      proposalsApi.updateProposal(id, input),
    onSuccess: (proposal) => {
      qc.invalidateQueries({ queryKey: ["sales-proposals", workspaceId] })
      qc.invalidateQueries({ queryKey: proposalKeys.detail(proposal.id) })
      toast.success("Proposta salva.")
    },
  })
}

export function useDeleteProposal(workspaceId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (proposalId: string) => proposalsApi.deleteProposal(proposalId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales-proposals", workspaceId] })
      toast.success("Proposta excluída.")
    },
  })
}

export function useSendProposal(workspaceId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: SendProposalInput }) =>
      proposalsApi.sendProposal(id, input),
    onSuccess: (proposal) => {
      qc.invalidateQueries({ queryKey: ["sales-proposals", workspaceId] })
      toast.success(`Proposta enviada para ${proposal.sent_to}.`)
    },
  })
}

/**
 * Aceite. Devolve a sugestão de ganhar o negócio — a tela decide o que fazer
 * com ela. Invalida também as queries do funil porque o valor do negócio pode
 * mudar logo em seguida.
 */
export function useAcceptProposal(workspaceId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (proposalId: string) => proposalsApi.acceptProposal(proposalId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales-proposals", workspaceId] })
      qc.invalidateQueries({ queryKey: salesKeys.deals(workspaceId) })
    },
  })
}

export function useRejectProposal(workspaceId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      proposalsApi.rejectProposal(id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales-proposals", workspaceId] })
      toast.success("Recusa registrada.")
    },
  })
}
