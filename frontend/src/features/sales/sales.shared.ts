// Helpers puros do comercial: conversão/format de dinheiro, agregação de coluna
// do pipeline e rótulos. Sem React aqui — é o que os testes de unidade cobrem.
import type { ActivityKind, Deal, PipelineStage, StageKind } from "./sales.types"

export const STAGE_KIND_LABEL: Record<StageKind, string> = {
  open: "Em aberto",
  won: "Ganho",
  lost: "Perdido",
}

export const ACTIVITY_LABEL: Record<ActivityKind, string> = {
  note: "Nota",
  task: "Tarefa",
  meeting: "Reunião",
}

export const CUSTOMER_KIND_LABEL = {
  company: "Empresa",
  person: "Pessoa física",
} as const

/** Converte o Decimal-string do backend em número. Vazio/inválido vira 0. */
export function dealAmount(deal: Pick<Deal, "amount">): number {
  const n = Number(deal.amount)
  return Number.isFinite(n) ? n : 0
}

/** Valor ponderado pela probabilidade (0–100) — o "peso real" do deal no funil. */
export function weightedAmount(deal: Pick<Deal, "amount" | "probability">): number {
  return dealAmount(deal) * (deal.probability / 100)
}

/** Moeda brasileira. Acima de 1 milhão encurta para caber no cabeçalho da coluna. */
export function formatMoney(value: number, currency = "BRL"): string {
  const compact = Math.abs(value) >= 1_000_000
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: compact ? 1 : 0,
  }).format(value)
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—"
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso))
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso))
}

export interface ColumnTotals {
  count: number
  total: number
  weighted: number
}

/** Agrega contagem, soma de valor e soma ponderada dos deals de uma coluna. */
export function columnTotals(deals: Deal[]): ColumnTotals {
  return deals.reduce<ColumnTotals>(
    (acc, d) => ({
      count: acc.count + 1,
      total: acc.total + dealAmount(d),
      weighted: acc.weighted + weightedAmount(d),
    }),
    { count: 0, total: 0, weighted: 0 },
  )
}

/** Estágios ordenados por `order` — a fonte de verdade das colunas do Kanban. */
export function sortStages(stages: PipelineStage[]): PipelineStage[] {
  return [...stages].sort((a, b) => a.order - b.order)
}

/**
 * Regra do spec: ao mover de estágio, a probabilidade só acompanha o default do
 * novo estágio se o usuário ainda não tinha editado manualmente (ou seja, se o
 * valor atual ainda é o default do estágio de origem). O backend é a autoridade;
 * aqui replicamos para o update otimista não "piscar" um valor errado.
 */
export function nextProbability(
  current: number,
  from: PipelineStage | undefined,
  to: PipelineStage,
): number {
  if (from && current !== from.probability_default) return current
  return to.probability_default
}

/** Estado do prazo previsto de fechamento — dirige a cor do chip no card. */
export type DueState = "overdue" | "today" | "soon" | "far"

export function closeDateState(iso: string | null, now = new Date()): DueState | null {
  if (!iso) return null
  const target = new Date(iso)
  const days = Math.floor(
    (new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime() -
      new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) /
      86_400_000,
  )
  if (days < 0) return "overdue"
  if (days === 0) return "today"
  if (days <= 7) return "soon"
  return "far"
}
