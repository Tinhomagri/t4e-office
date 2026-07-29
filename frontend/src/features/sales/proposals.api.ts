// Camada HTTP das Propostas.
import { api } from "@/shared/api/client"

import type {
  AcceptProposalResult,
  CreateProposalInput,
  Proposal,
  SendProposalInput,
  UpdateProposalInput,
} from "./proposals.types"

export async function listProposals(
  workspaceId: string,
  dealId?: string,
): Promise<Proposal[]> {
  const { data } = await api.get<Proposal[]>("/sales/proposals/", {
    params: { workspace_id: workspaceId, deal_id: dealId },
  })
  return data
}

export async function getProposal(proposalId: string): Promise<Proposal> {
  const { data } = await api.get<Proposal>(`/sales/proposals/${proposalId}/`)
  return data
}

export async function createProposal(
  workspaceId: string,
  input: CreateProposalInput,
): Promise<Proposal> {
  const { data } = await api.post<Proposal>("/sales/proposals/", {
    workspace_id: workspaceId,
    ...input,
  })
  return data
}

export async function updateProposal(
  proposalId: string,
  input: UpdateProposalInput,
): Promise<Proposal> {
  const { data } = await api.patch<Proposal>(`/sales/proposals/${proposalId}/`, input)
  return data
}

export async function deleteProposal(proposalId: string): Promise<void> {
  await api.delete(`/sales/proposals/${proposalId}/`)
}

export async function sendProposal(
  proposalId: string,
  input: SendProposalInput,
): Promise<Proposal> {
  const { data } = await api.post<Proposal>(`/sales/proposals/${proposalId}/send/`, input)
  return data
}

export async function acceptProposal(proposalId: string): Promise<AcceptProposalResult> {
  const { data } = await api.post<AcceptProposalResult>(
    `/sales/proposals/${proposalId}/accept/`,
  )
  return data
}

export async function rejectProposal(
  proposalId: string,
  reason: string,
): Promise<Proposal> {
  const { data } = await api.post<Proposal>(`/sales/proposals/${proposalId}/reject/`, {
    reason,
  })
  return data
}

/**
 * Abre o PDF numa aba nova.
 *
 * Não dá para usar `<a href>` direto: a rota exige o header Authorization, que
 * o navegador não manda numa navegação comum. Então buscamos pelo axios (que
 * já injeta o token) e abrimos o blob.
 */
export async function openProposalPdf(proposalId: string, number: number): Promise<void> {
  const { data } = await api.get<Blob>(`/sales/proposals/${proposalId}/pdf/`, {
    responseType: "blob",
  })
  const url = URL.createObjectURL(new Blob([data], { type: "application/pdf" }))
  const link = document.createElement("a")
  link.href = url
  link.target = "_blank"
  link.rel = "noreferrer"
  link.download = `proposta-${number}.pdf`
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Revoga depois do clique: revogar na hora cancelaria o download.
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}
