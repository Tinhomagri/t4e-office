// Painéis do Command Deck: funil, previsão, ranking e heatmap.
//
// Regra de cor: a série carrega a cor, mas nunca sozinha — todo elemento tem
// rótulo textual ou tooltip. Isso mantém os painéis legíveis para daltônicos e
// em impressão P&B (o PDF exportado sai colorido, mas nem sempre é impresso).
import { AnimatePresence, motion, useInView, useReducedMotion } from "framer-motion"
import { useRef, useState } from "react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { cx } from "@/shared/ui/primitives"

import type { PipelineMetrics } from "../sales.metrics"
import { type FunnelStep, activityHeatmap, buildFunnel, heatLevel } from "./deck.data"
import { DECK, HEAT, TONE, compact, full, seriesColor } from "./deck.theme"

const AXIS = { fill: DECK.textFaint, fontSize: 11 }

// ─── Tooltip comum ───────────────────────────────────────────────────────────

function DeckTooltip({
  active,
  label,
  rows,
}: {
  active?: boolean
  label?: string
  rows: { name: string; value: string; color?: string }[]
}) {
  if (!active) return null
  return (
    <div
      className="rounded-md border px-2.5 py-2 text-[11px] shadow-pop"
      style={{ background: DECK.surfaceHi, borderColor: DECK.borderHi, color: DECK.text }}
    >
      {label && <p className="mb-1 font-semibold">{label}</p>}
      {rows.map((r) => (
        <p key={r.name} className="flex items-center gap-1.5 tabular">
          {r.color && (
            <span className="size-1.5 rounded-full" style={{ background: r.color }} aria-hidden />
          )}
          <span style={{ color: DECK.textDim }}>{r.name}</span>
          <span className="ml-auto font-medium">{r.value}</span>
        </p>
      ))}
    </div>
  )
}

// ─── Funil ───────────────────────────────────────────────────────────────────

/**
 * Faixas que estreitam a cada etapa — a perda entre estágios vira geometria, e
 * não só um número. Cada faixa escala em X a partir do centro (transform, sem
 * layout) quando o painel entra em cena.
 */
export function FunnelFlow({
  metrics,
  onSelectStage,
  selectedStage,
}: {
  metrics: PipelineMetrics
  onSelectStage: (stageId: string | null) => void
  selectedStage: string | null
}) {
  const reduce = useReducedMotion()
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: "-40px" })
  const steps = buildFunnel(metrics.by_stage)

  if (steps.length === 0) {
    return <Empty>Nenhum estágio aberto configurado no pipeline.</Empty>
  }

  return (
    <div ref={ref} className="space-y-1.5">
      {steps.map((step, i) => (
        <FunnelBand
          key={step.stage_id}
          step={step}
          index={i}
          color={seriesColor(i)}
          animate={inView}
          reduce={!!reduce}
          selected={selectedStage === step.stage_id}
          onSelect={() => onSelectStage(selectedStage === step.stage_id ? null : step.stage_id)}
        />
      ))}
    </div>
  )
}

function FunnelBand({
  step,
  index,
  color,
  animate,
  reduce,
  selected,
  onSelect,
}: {
  step: FunnelStep
  index: number
  color: string
  animate: boolean
  reduce: boolean
  selected: boolean
  onSelect: () => void
}) {
  // Piso de 8% para a faixa nunca sumir: um estágio com 1 negócio ainda
  // precisa ser clicável e legível.
  const width = Math.max(0.08, step.share)

  return (
    <div>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className="group flex w-full items-center gap-3 rounded-lg px-1 py-1 text-left transition-colors hover:bg-[var(--deck-overlay-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300"
      >
        <span className="w-28 shrink-0 truncate text-[12px]" style={{ color: DECK.text }}>
          {step.name}
        </span>

        <span className="relative h-8 flex-1 overflow-hidden rounded-md bg-[var(--deck-overlay-1)]">
          <motion.span
            initial={reduce ? false : { scaleX: 0 }}
            animate={animate || reduce ? { scaleX: width } : undefined}
            transition={{
              duration: reduce ? 0 : 0.6,
              ease: [0.16, 1, 0.3, 1],
              delay: reduce ? 0 : 0.1 + index * 0.08,
            }}
            style={{
              transformOrigin: "left",
              background: `linear-gradient(90deg, ${color}, ${color}66)`,
              boxShadow: selected ? `0 0 0 1px ${color}, 0 0 12px ${color}55` : undefined,
            }}
            className="absolute inset-y-0 left-0 w-full rounded-md"
          />
          <span
            className="absolute inset-y-0 left-2.5 flex items-center gap-2 text-[11px] font-medium tabular"
            style={{ color: DECK.onFill }}
          >
            {step.count}
            <span className="opacity-70">{compact(step.amount)}</span>
          </span>
        </span>

        <span className="w-20 shrink-0 text-right text-[11px] tabular" style={{ color: DECK.textDim }}>
          {step.stale_count > 0 ? (
            <span style={{ color: TONE.warning }}>{step.stale_count} parados</span>
          ) : (
            `${step.avg_age_days}d`
          )}
        </span>
      </button>

      {/* Conversão para a próxima etapa, entre as faixas. */}
      {step.conversion != null && (
        <p
          className="ml-[124px] flex items-center gap-1 py-0.5 text-[10px] tabular"
          style={{ color: step.conversion >= 50 ? TONE.positive : DECK.textFaint }}
        >
          <span aria-hidden>↓</span>
          {step.conversion.toFixed(0)}% avançam
        </p>
      )}
    </div>
  )
}

// ─── Previsão ────────────────────────────────────────────────────────────────

export function ForecastChart({ metrics }: { metrics: PipelineMetrics }) {
  const data = metrics.forecast.map((f) => ({
    month: monthLabel(f.month),
    amount: Number(f.amount),
    weighted: Number(f.weighted),
  }))

  if (data.length === 0) {
    return <Empty>Nenhum negócio aberto tem data de fechamento definida.</Empty>
  }

  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: -12 }}>
          <defs>
            <linearGradient id="deck-amount" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SERIES_A} stopOpacity={0.35} />
              <stop offset="100%" stopColor={SERIES_A} stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="deck-weighted" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SERIES_B} stopOpacity={0.5} />
              <stop offset="100%" stopColor={SERIES_B} stopOpacity={0.04} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={DECK.grid} vertical={false} />
          <XAxis dataKey="month" tick={AXIS} tickLine={false} axisLine={false} />
          <YAxis
            tick={AXIS}
            tickLine={false}
            axisLine={false}
            width={56}
            tickFormatter={(v: number) => compact(v)}
          />
          <Tooltip
            cursor={{ stroke: DECK.borderHi }}
            content={({ active, label, payload }) => (
              <DeckTooltip
                active={active}
                label={String(label ?? "")}
                rows={(payload ?? []).map((p) => ({
                  name: p.dataKey === "amount" ? "Total" : "Ponderado",
                  value: full(Number(p.value)),
                  color: p.dataKey === "amount" ? SERIES_A : SERIES_B,
                }))}
              />
            )}
          />
          <Area
            type="monotone"
            dataKey="amount"
            stroke={SERIES_A}
            strokeWidth={1.5}
            fill="url(#deck-amount)"
            animationDuration={700}
          />
          <Area
            type="monotone"
            dataKey="weighted"
            stroke={SERIES_B}
            strokeWidth={2}
            fill="url(#deck-weighted)"
            animationDuration={700}
          />
        </AreaChart>
      </ResponsiveContainer>
      <Legend
        items={[
          { label: "Valor total", color: SERIES_A },
          { label: "Ponderado pela probabilidade", color: SERIES_B },
        ]}
      />
    </div>
  )
}

const SERIES_A = seriesColor(0)
const SERIES_B = seriesColor(1)

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" })
}

// ─── Ranking por responsável ─────────────────────────────────────────────────

export function OwnerRanking({
  metrics,
  onSelectOwner,
  selectedOwner,
}: {
  metrics: PipelineMetrics
  onSelectOwner?: (ownerId: string | null) => void
  selectedOwner?: string | null
}) {
  const data = [...metrics.by_owner]
    .map((o) => ({
      id: o.owner_id,
      name: o.name,
      weighted: Number(o.weighted_amount),
      won: Number(o.won_amount),
      open: o.open_count,
    }))
    .sort((a, b) => b.weighted - a.weighted)
    .slice(0, 8)

  if (data.length === 0) return <Empty>Nenhum negócio atribuído a um responsável.</Empty>

  return (
    <div style={{ height: Math.max(140, data.length * 34) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={DECK.grid} horizontal={false} />
          <XAxis
            type="number"
            tick={AXIS}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => compact(v)}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={AXIS}
            tickLine={false}
            axisLine={false}
            width={96}
          />
          <Tooltip
            cursor={{ fill: DECK.overlay2 }}
            content={({ active, label, payload }) => (
              <DeckTooltip
                active={active}
                label={String(label ?? "")}
                rows={[
                  { name: "Previsão", value: full(Number(payload?.[0]?.value ?? 0)) },
                  {
                    name: "Em aberto",
                    value: String(payload?.[0]?.payload?.open ?? 0),
                  },
                ]}
              />
            )}
          />
          <Bar
            dataKey="weighted"
            radius={[0, 4, 4, 0]}
            animationDuration={650}
            barSize={16}
            // Clicar num responsável filtra o deck; clicar de novo desfaz.
            onClick={(entry: { id?: string | null }) =>
              onSelectOwner?.(selectedOwner === entry?.id ? null : (entry?.id ?? null))
            }
            className={onSelectOwner ? "cursor-pointer" : undefined}
          >
            {data.map((d, i) => (
              <Cell
                key={i}
                fill={seriesColor(i)}
                fillOpacity={selectedOwner && selectedOwner !== d.id ? 0.35 : 1}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Heatmap de atividade ────────────────────────────────────────────────────
//
// Estilo GitHub/Power BI: células de tamanho fixo (nunca esticam pra preencher
// o card — é isso que fazia os quadrados ficarem gigantes com poucas semanas),
// rótulos de mês acima da grade, e um tooltip flutuante que segue a célula em
// vez de uma linha de texto estática embaixo.

const WEEKDAYS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"]
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]
const GAP = 4

// Janela de um ano, como o gráfico de contribuições do GitHub. Com 12 semanas a
// grade tinha 12 colunas para preencher um card de largura inteira: ou as
// células ficavam minúsculas num mar de vazio, ou virariam blocos enormes se
// esticadas. 52 colunas dão densidade real à mesma faixa horizontal.
const WEEKS = 52

export function ActivityHeatmap({ activities }: { activities: { created_at: string }[] }) {
  const reduce = useReducedMotion()
  const [hover, setHover] = useState<{ date: string; count: number; x: number; y: number } | null>(
    null,
  )
  const { cells, max, weeks } = activityHeatmap(activities, WEEKS)

  const monthLabels = cells
    .filter((c) => c.weekday === 0)
    .map((c) => ({ week: c.week, label: MONTHS[new Date(`${c.date}T12:00:00`).getMonth()] }))
    .filter((m, i, arr) => i === 0 || arr[i - 1]!.label !== m.label)

  return (
    <div className="relative">
      {/* items-stretch (padrão do flex) faz a coluna de rótulos herdar a altura
          da grade — é o que mantém "seg…dom" alinhado às linhas agora que a
          altura das células é derivada da largura, não mais fixa em px. */}
      <div className="flex gap-2">
        <div
          className="grid shrink-0 pt-[18px]"
          style={{ gridTemplateRows: "repeat(7, minmax(0, 1fr))", gap: GAP }}
        >
          {WEEKDAYS.map((d) => (
            <span
              key={d}
              className="flex items-center text-[9px] leading-none"
              style={{ color: DECK.textFaint }}
            >
              {d}
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1 pb-1">
          <div className="relative" style={{ height: 18 }}>
            {monthLabels.map((m) => (
              <span
                key={m.week}
                className="absolute top-0 text-[9px] leading-none"
                // Posição em % acompanha a largura fluida das colunas.
                style={{ left: `${(m.week / weeks) * 100}%`, color: DECK.textFaint }}
              >
                {m.label}
              </span>
            ))}
          </div>

          <div
            className="grid"
            style={{
              gap: GAP,
              // 1fr por semana: a grade ocupa o card inteiro, e cada célula
              // continua quadrada via aspect-square.
              gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))`,
              gridAutoFlow: "column",
            }}
            role="img"
            aria-label={`Atividades registradas nas últimas ${weeks} semanas. Pico de ${max} num único dia.`}
          >
            {cells.map((cell, i) => (
              <motion.div
                key={cell.date}
                initial={reduce ? false : { opacity: 0, scale: 0.4 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.28, delay: reduce ? 0 : Math.min(i * 0.0022, 0.5), ease: "easeOut" }}
                onMouseEnter={(e) => {
                  const r = e.currentTarget.getBoundingClientRect()
                  setHover({ date: cell.date, count: cell.count, x: r.left + r.width / 2, y: r.top })
                }}
                onMouseLeave={() => setHover(null)}
                style={{
                  background: HEAT[heatLevel(cell.count, max)],
                  gridRow: cell.weekday + 1,
                  gridColumn: cell.week + 1,
                  boxShadow: hover?.date === cell.date ? `0 0 0 1.5px ${DECK.borderHi}` : undefined,
                }}
                className="aspect-square rounded-[3px] hover:z-10"
              />
            ))}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {hover && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.96 }}
            transition={{ duration: 0.14 }}
            className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full rounded-lg border px-2.5 py-1.5 text-[11px] shadow-lg"
            style={{
              left: hover.x,
              top: hover.y - 8,
              background: DECK.surfaceHi,
              borderColor: DECK.borderHi,
              color: DECK.text,
            }}
          >
            <strong className="tabular font-medium">{hover.count}</strong>{" "}
            <span style={{ color: DECK.textDim }}>
              atividade{hover.count === 1 ? "" : "s"} ·{" "}
              {new Date(`${hover.date}T12:00:00`).toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "short",
              })}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-2 flex items-center gap-2 text-[10px]" style={{ color: DECK.textFaint }}>
        <span className="tabular">{activities.length} atividades no período</span>
        <span className="ml-auto flex items-center gap-1">
          menos
          {HEAT.map((c, i) => (
            <span key={i} className="size-2 rounded-[2px]" style={{ background: c }} />
          ))}
          mais
        </span>
      </div>
    </div>
  )
}

// ─── Auxiliares ──────────────────────────────────────────────────────────────

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-3 text-[10px]" style={{ color: DECK.textDim }}>
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full" style={{ background: i.color }} aria-hidden />
          {i.label}
        </span>
      ))}
    </div>
  )
}

export function Empty({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cx("py-8 text-center text-[12px]", className)} style={{ color: DECK.textFaint }}>
      {children}
    </p>
  )
}
