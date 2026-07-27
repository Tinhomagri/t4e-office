// Derivações do Command Deck. Funções puras sobre o que a API já devolve —
// nenhuma série é inventada: se o dado não existe, o painel mostra vazio.
import type { PipelineMetrics, StageMetrics } from "../sales.metrics"
import type { Deal, DealActivity } from "../sales.types"

export interface Bucket {
  /** Início do bucket, em ISO date (YYYY-MM-DD). */
  key: string
  label: string
  count: number
  amount: number
}

const DAY = 86_400_000

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`
}

/** Segunda-feira da semana de `d`, à meia-noite local. */
export function weekStart(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const dow = (out.getDay() + 6) % 7 // 0 = segunda
  out.setDate(out.getDate() - dow)
  return out
}

/**
 * Agrupa por semana num intervalo fixo terminando hoje. Semanas sem evento
 * viram zero — a lacuna precisa aparecer no gráfico, não sumir.
 */
export function weeklyBuckets(
  items: { date: string | null; amount?: number }[],
  weeks: number,
  now = new Date(),
): Bucket[] {
  const first = weekStart(new Date(now.getTime() - (weeks - 1) * 7 * DAY))
  const out: Bucket[] = []
  for (let i = 0; i < weeks; i++) {
    const start = new Date(first.getTime() + i * 7 * DAY)
    out.push({
      key: isoDay(start),
      label: start.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      count: 0,
      amount: 0,
    })
  }
  const index = new Map(out.map((b, i) => [b.key, i]))
  for (const item of items) {
    if (!item.date) continue
    const parsed = new Date(item.date)
    if (Number.isNaN(parsed.getTime())) continue
    const i = index.get(isoDay(weekStart(parsed)))
    if (i == null) continue
    out[i].count += 1
    out[i].amount += item.amount ?? 0
  }
  return out
}

/**
 * Variação percentual da segunda metade da série contra a primeira. Retorna
 * null quando a base é zero — "∞%" não informa nada.
 */
export function trendDelta(values: number[]): number | null {
  if (values.length < 4) return null
  const half = Math.floor(values.length / 2)
  const before = values.slice(0, half).reduce((a, b) => a + b, 0)
  const after = values.slice(half).reduce((a, b) => a + b, 0)
  if (before === 0) return null
  return ((after - before) / before) * 100
}

export interface FunnelStep extends StageMetrics {
  amount: number
  weighted: number
  /** Fração do topo do funil (0–1) — largura da faixa. */
  share: number
  /** Conversão para o próximo estágio, em % (null no último). */
  conversion: number | null
}

/**
 * Monta o funil a partir dos estágios abertos, na ordem do pipeline. A largura
 * usa contagem de negócios (e não valor), porque é a contagem que descreve
 * passagem de etapa; o valor aparece como rótulo.
 */
export function buildFunnel(stages: StageMetrics[]): FunnelStep[] {
  const open = stages.filter((s) => s.kind === "open").sort((a, b) => a.order - b.order)
  const top = open[0]?.count ?? 0
  return open.map((s, i) => {
    const next = open[i + 1]
    return {
      ...s,
      amount: Number(s.total_amount),
      weighted: Number(s.weighted_amount),
      share: top > 0 ? s.count / top : 0,
      conversion: next && s.count > 0 ? (next.count / s.count) * 100 : null,
    }
  })
}

export interface HeatCell {
  /** 0 = segunda … 6 = domingo. */
  weekday: number
  /** Índice da semana na janela (0 = mais antiga). */
  week: number
  date: string
  count: number
}

/** Matriz semana × dia-da-semana das atividades registradas. */
export function activityHeatmap(
  activities: Pick<DealActivity, "created_at">[],
  weeks = 12,
  now = new Date(),
): { cells: HeatCell[]; max: number; weeks: number } {
  const first = weekStart(new Date(now.getTime() - (weeks - 1) * 7 * DAY))
  const counts = new Map<string, number>()
  for (const a of activities) {
    const d = new Date(a.created_at)
    if (Number.isNaN(d.getTime()) || d < first) continue
    const key = isoDay(new Date(d.getFullYear(), d.getMonth(), d.getDate()))
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const cells: HeatCell[] = []
  let max = 0
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 7; d++) {
      const day = new Date(first.getTime() + (w * 7 + d) * DAY)
      const date = isoDay(day)
      const count = counts.get(date) ?? 0
      max = Math.max(max, count)
      cells.push({ weekday: d, week: w, date, count })
    }
  }
  return { cells, max, weeks }
}

/** Degrau da rampa de calor (0 = vazio … 4 = máximo). */
export function heatLevel(count: number, max: number): number {
  if (count === 0 || max === 0) return 0
  return Math.min(4, Math.ceil((count / max) * 4))
}

// ─── Planilhas de exportação ─────────────────────────────────────────────────

export function dealsSheet(deals: Deal[], stageName: (id: string) => string) {
  return {
    name: "Negócios",
    columns: [
      "Título",
      "Cliente",
      "Estágio",
      "Valor",
      "Probabilidade (%)",
      "Previsão ponderada",
      "Fechamento esperado",
      "Origem",
      "Criado em",
    ],
    rows: deals.map((d) => [
      d.title,
      d.customer_name,
      stageName(d.stage_id),
      Number(d.amount),
      d.probability,
      Number(d.amount) * (d.probability / 100),
      d.expected_close_date ?? "",
      d.source,
      d.created_at.slice(0, 10),
    ]),
  }
}

export function stagesSheet(metrics: PipelineMetrics) {
  return {
    name: "Por estágio",
    columns: [
      "Estágio",
      "Tipo",
      "Negócios",
      "Valor total",
      "Previsão ponderada",
      "Parados 14d+",
      "Idade média (dias)",
    ],
    rows: metrics.by_stage.map((s) => [
      s.name,
      s.kind,
      s.count,
      Number(s.total_amount),
      Number(s.weighted_amount),
      s.stale_count,
      s.avg_age_days,
    ]),
  }
}

export function ownersSheet(metrics: PipelineMetrics) {
  return {
    name: "Por responsável",
    columns: ["Responsável", "Em aberto", "Valor aberto", "Previsão ponderada", "Ganhos", "Valor ganho"],
    rows: metrics.by_owner.map((o) => [
      o.name,
      o.open_count,
      Number(o.open_amount),
      Number(o.weighted_amount),
      o.won_count,
      Number(o.won_amount),
    ]),
  }
}

export function forecastSheet(metrics: PipelineMetrics) {
  return {
    name: "Previsão",
    columns: ["Mês", "Valor", "Ponderado"],
    rows: metrics.forecast.map((f) => [f.month, Number(f.amount), Number(f.weighted)]),
  }
}
