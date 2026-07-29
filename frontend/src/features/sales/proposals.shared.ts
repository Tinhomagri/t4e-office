// Helpers puros das Propostas.
//
// Regra de ouro deste arquivo: o backend é a fonte da verdade do dinheiro. As
// funções daqui FORMATAM e fazem prévia otimista enquanto o usuário digita —
// o total que vale é sempre o que voltou da API.
import type { LineItemInput, Proposal, ProposalStatus } from "./proposals.types"

export const STATUS_LABELS: Record<ProposalStatus, string> = {
  draft: "Rascunho",
  sent: "Enviada",
  accepted: "Aceita",
  rejected: "Recusada",
}

export const STATUS_TONE: Record<ProposalStatus, "neutral" | "brand" | "success" | "danger"> = {
  draft: "neutral",
  sent: "brand",
  accepted: "success",
  rejected: "danger",
}

const SYMBOLS: Record<string, string> = { BRL: "R$", USD: "US$", EUR: "€" }

/** Formata no padrão pt-BR, a partir da string Decimal que o DRF devolve. */
export function formatMoney(value: string | number, currency = "BRL"): string {
  const numeric = typeof value === "number" ? value : Number(value ?? 0)
  if (Number.isNaN(numeric)) return `${SYMBOLS[currency] ?? currency} 0,00`
  return `${SYMBOLS[currency] ?? currency} ${numeric.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

/** Quantidade sem zeros à toa: 3 em vez de 3,0000. */
export function formatQuantity(value: string | number): string {
  const numeric = typeof value === "number" ? value : Number(value ?? 0)
  if (Number.isNaN(numeric)) return "0"
  return numeric.toLocaleString("pt-BR", { maximumFractionDigits: 4 })
}

export function formatDate(iso: string | null): string {
  if (!iso) return ""
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
}

/**
 * Prévia do subtotal de uma linha enquanto o usuário digita.
 *
 * Espelha o domínio de propósito: o valor unitário é fechado em centavos ANTES
 * de multiplicar. Sem isso a tela mostraria um total e o PDF outro.
 */
export function previewLineSubtotal(item: LineItemInput): number {
  const quantity = Number(String(item.quantity).replace(",", ".")) || 0
  const rawPrice = Number(String(item.unit_price).replace(",", ".")) || 0
  if (quantity <= 0) return 0
  const price = Math.round(rawPrice * 100) / 100
  return Math.round(quantity * price * 100) / 100
}

/** Prévia do subtotal da proposta — soma das linhas já fechadas. */
export function previewSubtotal(items: LineItemInput[]): number {
  return items.reduce((sum, item) => sum + previewLineSubtotal(item), 0)
}

/** Prévia do total. Nunca negativo, igual ao domínio. */
export function previewTotal(items: LineItemInput[], discount: string | number): number {
  const subtotal = previewSubtotal(items)
  const value = Number(String(discount).replace(",", ".")) || 0
  const total = subtotal - value
  return total > 0 ? Math.round(total * 100) / 100 : 0
}

/** Desconto maior que o subtotal — o backend recusa, a tela avisa antes. */
export function discountExceedsSubtotal(
  items: LineItemInput[],
  discount: string | number,
): boolean {
  const value = Number(String(discount).replace(",", ".")) || 0
  return value > previewSubtotal(items)
}

/** Uma proposta só pode ir ao cliente com ao menos um item válido. */
export function canSend(items: LineItemInput[]): boolean {
  return items.some((item) => item.description.trim() && previewLineSubtotal(item) >= 0 && Number(String(item.quantity).replace(",", ".")) > 0)
}

/** Ordena para a lista: mais recentes primeiro, por número decrescente. */
export function sortProposals(proposals: Proposal[]): Proposal[] {
  return [...proposals].sort((a, b) => b.number - a.number)
}

/** Rótulo do prazo, já sinalizando vencimento. */
export function validityLabel(proposal: Proposal): string {
  if (!proposal.valid_until) return "Sem prazo"
  const formatted = formatDate(proposal.valid_until)
  return proposal.is_expired ? `Venceu em ${formatted}` : `Válida até ${formatted}`
}

export const EMPTY_ITEM: LineItemInput = { description: "", quantity: "1", unit_price: "0" }
