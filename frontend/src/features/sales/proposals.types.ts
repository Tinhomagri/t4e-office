// Tipos das Propostas comerciais. Espelham
// `contexts/sales/interface/api/proposal_serializers.py`.
//
// Todo valor monetário chega como string (Decimal do DRF) — converter para
// number no cálculo perderia centavo. Os totais vêm PRONTOS do backend: quem
// calcula dinheiro é o domínio, nunca a tela.

export type ProposalStatus = "draft" | "sent" | "accepted" | "rejected"

export interface ProposalLineItem {
  id: string | null
  description: string
  quantity: string
  unit_price: string
  /** Calculado no backend: quantidade × valor unitário. */
  subtotal: string
  position: number
}

export interface Proposal {
  id: string
  workspace_id: string
  deal_id: string
  deal_title: string
  customer_name: string
  /** Sequencial por workspace — o número que o cliente cita. */
  number: number
  title: string
  status: ProposalStatus
  currency: string
  intro: string
  terms: string
  valid_until: string | null
  items: ProposalLineItem[]
  discount: string
  subtotal: string
  total: string
  /** Derivados do domínio — não recalcular no frontend. */
  is_expired: boolean
  is_editable: boolean
  sent_at: string | null
  sent_to: string
  accepted_at: string | null
  rejected_at: string | null
  rejection_reason: string
  created_at: string | null
  updated_at: string | null
}

export interface LineItemInput {
  description: string
  quantity: string
  unit_price: string
}

export interface CreateProposalInput {
  deal_id: string
  title?: string
  currency?: string
  intro?: string
  terms?: string
  valid_until?: string | null
  discount?: string
  items?: LineItemInput[]
}

export interface UpdateProposalInput {
  title?: string
  currency?: string
  intro?: string
  terms?: string
  valid_until?: string | null
  discount?: string
  items?: LineItemInput[]
}

export interface SendProposalInput {
  to_email: string
  message?: string
}

/**
 * Sugestão devolvida ao aceitar. Vem `null` quando o negócio já está ganho.
 * Decisão de produto: o aceite NÃO ganha o negócio sozinho — sugere, e quem
 * confirma é o vendedor.
 */
export interface WinDealSuggestion {
  action: "win_deal"
  deal_id: string
  deal_title: string
  amount: string
  currency: string
}

export interface AcceptProposalResult {
  proposal: Proposal
  suggestion: WinDealSuggestion | null
}
