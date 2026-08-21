/** Dashboard do Resumo — donuts, tendências, lead time e tabela de detalhes.
 *
 * Layout espelha o dashboard do Jira. As agregações moram em `resumo.metrics.ts`
 * (com teste); aqui só há apresentação.
 *
 * Paleta: as 8 escalas do tailwind.config validadas para CVD e contraste nas duas
 * superfícies (claro e ink-900), nesta ordem — o pior par adjacente fica em ΔE 9.9
 * (protanopia), fora da banda de piso. Não reordene sem revalidar: a ordem é o
 * que garante que vizinhos na pilha sejam distinguíveis.
 */
import { useEffect, useMemo, useState } from "react"
import { motion, useReducedMotion } from "framer-motion"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Search } from "lucide-react"

import { IssueTypeIcon, PriorityIcon } from "@/shared/ui/issue"
import { cx } from "@/shared/ui/primitives"
import { PRIORITY_LABEL, STATUS_LABEL, TYPE_LABEL } from "../board.shared"
import {
  completionTrend,
  countBy,
  creationTrend,
  leadTimeByWeek,
  shortDay,
  shortMonth,
  topNSlices,
  isDelivered,
  type Slice,
} from "./resumo.metrics"
import type { Card, CardPriority, CardStatus } from "@/features/workspace/workspace.types"

/** Paleta validada para CVD/contraste. A escolha dentro dela é por chave
 * (ver `hueMap`), nunca pela posição da fatia no ranking. */
const HUES = [
  "#0C66E4", // blue-500
  "#22A06B", // green-500
  "#E56910", // orange-500
  "#8270DB", // purple-500
  "#6A9A23", // lime-500
  "#CD519D", // magenta-500
  "#946F00", // yellow-700
  "#2898BD", // teal-500
] as const

/** "Outros" é neutro de propósito: um 9º hue gerado brigaria com as 8 séries. */
const OTHER_HUE = "#8590A2"

const MAX_SLICES = 8

/** Status tem cor com significado: verde é entregue, amarelo é em curso. Herdar
 * a cor do ranking pintaria "Concluído" de azul só por ser a maior fatia. */
const STATUS_HUE: Record<string, string> = {
  backlog: "#8590A2", todo: "#8270DB", doing: "#E2B203", review: "#CD519D", done: "#22A06B",
  briefing: "#6E5DC6", criacao: "#0C66E4", aprovacao: "#946F00", agendado: "#2898BD", publicado: "#6A9A23",
}

/** Sem responsável é ausência de dado, não uma pessoa — fica no cinza de "Outros". */
const UNASSIGNED_HUE = OTHER_HUE

/** Cor que a chave "quer" ter: semântica para status, hash estável no resto. */
function preferredHue(key: string): string {
  if (key in STATUS_HUE) return STATUS_HUE[key]
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) & 0xffff
  return HUES[h % HUES.length]
}

/**
 * Cor derivada da CHAVE, nunca da posição no ranking.
 *
 * Colorir por índice fazia todo painel começar no mesmo azul: status, tipo e
 * responsável saíam com a paleta idêntica na mesma ordem, e os três donuts
 * pareciam o mesmo gráfico repetido.
 *
 * O hash sozinho não basta: duas chaves podem cair no mesmo hue e virar duas
 * fatias indistinguíveis lado a lado. Por isso a atribuição é resolvida no
 * conjunto — quem chega e encontra a cor ocupada pega o próximo hue livre.
 * Determinístico para a mesma lista, e a série mantém a cor entre o donut e a
 * tendência porque ambos recebem as mesmas fatias.
 */
function hueMap(slices: { key: string }[]): Map<string, string> {
  const out = new Map<string, string>()
  const used = new Set<string>()
  // Neutros primeiro: não disputam a paleta, e reservá-los evita que uma
  // categoria real receba o cinza por acidente de ordem.
  for (const s of slices) {
    if (s.key === "__other__") out.set(s.key, OTHER_HUE)
    if (s.key === "__none__") out.set(s.key, UNASSIGNED_HUE)
  }
  for (const s of slices) {
    if (out.has(s.key)) continue
    const pref = preferredHue(s.key)
    const hue = used.has(pref) ? HUES.find((h) => !used.has(h)) ?? pref : pref
    used.add(hue)
    out.set(s.key, hue)
  }
  return out
}

// ─── Chrome dos gráficos ──────────────────────────────────────────────────────

const AXIS = { fontSize: 10, fill: "#8590A2" } as const
const GRID = "#DCDFE4"
const GRID_DARK = "#2E3338"

function useGridColor(): string {
  // A classe `dark` mora no <html>; ler dela evita duplicar o gráfico por tema.
  return typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark")
    ? GRID_DARK
    : GRID
}

// Duração da entrada. Curta o bastante para não atrasar a leitura do número,
// longa o bastante para o olho acompanhar a barra subindo.
const INTRO_MS = 850
// Escada entre painéis: o dashboard "monta" da esquerda para a direita em vez
// de piscar tudo de uma vez.
const STEP_MS = 70

/**
 * Verdadeiro só na primeira montagem, pelo tempo da entrada.
 *
 * Sem isso a animação repetiria a cada mudança de dados — filtrar, trocar de
 * período ou um refetch em segundo plano fariam os gráficos redesenharem do
 * zero, o que lê como travamento, não como polimento.
 */
function useIntro(): boolean {
  const reduce = useReducedMotion()
  const [running, setRunning] = useState(true)
  useEffect(() => {
    const id = window.setTimeout(() => setRunning(false), INTRO_MS + STEP_MS * 8)
    return () => window.clearTimeout(id)
  }, [])
  return !reduce && running
}

function Panel({
  title,
  action,
  children,
  className,
  index = 0,
}: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
  /** Posição na escada de entrada. */
  index?: number
}) {
  const reduce = useReducedMotion()
  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: (index * STEP_MS) / 1000 }}
      className={cx(
        "rounded-2xl border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-900 p-4 shadow-card dark:shadow-none",
        className,
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-[13px] font-semibold text-ink dark:text-paper">{title}</h3>
        {action}
      </div>
      {children}
    </motion.section>
  )
}

/** Tooltip único para todos os gráficos — texto em tokens de ink, cor só no ponto.
 *
 * O valor nunca herda a cor da série: número colorido perde contraste no claro e
 * no escuro, e a identidade já vem do ponto ao lado.
 */
function ChartTooltip({
  active,
  payload,
  label,
  labelFormat,
  suffix,
}: {
  active?: boolean
  payload?: { name?: string; value?: number | null; color?: string; payload?: Record<string, unknown> }[]
  label?: string
  labelFormat?: (v: string) => string
  suffix?: string
}) {
  if (!active || !payload?.length) return null
  const rows = payload.filter((p) => p.value != null && p.value !== 0)
  if (rows.length === 0) return null
  return (
    <div className="rounded-lg border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-800 px-2.5 py-2 shadow-pop">
      {label != null && (
        <p className="mb-1 text-[11px] font-semibold text-ink dark:text-paper">
          {labelFormat ? labelFormat(String(label)) : label}
        </p>
      )}
      <ul className="space-y-0.5">
        {rows.map((p, i) => (
          <li key={i} className="flex items-center gap-1.5 text-[11px] text-paper-500">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: p.color }}
              aria-hidden
            />
            <span className="text-ink dark:text-paper">{p.name}</span>
            <span className="ml-auto pl-2 font-semibold tabular-nums text-ink dark:text-paper">
              {p.value}
              {suffix}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Legenda própria (não a do recharts): quebra em várias linhas e usa ink no texto. */
function Legend({
  slices,
  hues,
}: {
  slices: { label: string; key: string }[]
  hues: Map<string, string>
}) {
  return (
    <ul className="mt-3 flex flex-wrap justify-center gap-x-3 gap-y-1">
      {slices.map((s) => (
        <li key={s.key} className="flex items-center gap-1 text-[10px] text-paper-500">
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: hues.get(s.key) }}
            aria-hidden
          />
          <span className="max-w-[110px] truncate" title={s.label}>
            {s.label}
          </span>
        </li>
      ))}
    </ul>
  )
}

// ─── Donut ────────────────────────────────────────────────────────────────────

function DonutPanel({ title, slices, index = 0 }: { title: string; slices: Slice[]; index?: number }) {
  const total = slices.reduce((sum, s) => sum + s.value, 0)
  const hues = useMemo(() => hueMap(slices), [slices])
  const intro = useIntro()
  return (
    <Panel title={title} index={index}>
      {total === 0 ? (
        <EmptyPlot />
      ) : (
        <>
          <div className="relative h-[176px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="value"
                  nameKey="label"
                  innerRadius={54}
                  outerRadius={82}
                  // 2px de superfície entre fatias: sem o vão, dois hues
                  // adjacentes se tocam e a borda some para quem tem CVD.
                  paddingAngle={2}
                  stroke="none"
                  // O donut entra girando e abrindo do centro; depois da
                  // entrada a animação é desligada para que filtrar não
                  // redesenhe o gráfico inteiro a cada tecla.
                  isAnimationActive={intro}
                  animationBegin={index * STEP_MS}
                  animationDuration={INTRO_MS}
                  animationEasing="ease-out"
                >
                  {slices.map((s) => (
                    <Cell key={s.key} fill={hues.get(s.key)} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            {/* Número herói no centro, fora do SVG para herdar os tokens de texto. */}
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <div className="text-center">
                <p className="text-xl font-bold tabular-nums text-ink dark:text-paper">
                  {total.toLocaleString("pt-BR")}
                </p>
                <p className="text-[10px] text-paper-400">Valor total</p>
              </div>
            </div>
          </div>
          <Legend slices={slices} hues={hues} />
        </>
      )}
    </Panel>
  )
}

function EmptyPlot({ label = "Sem dados no período" }: { label?: string }) {
  return (
    <div className="grid h-[176px] place-items-center text-xs text-paper-400">{label}</div>
  )
}

// ─── Tendências empilhadas ────────────────────────────────────────────────────

function StackedTrendPanel({
  title,
  rows,
  series,
  xKey,
  xFormat,
  index = 0,
}: {
  title: string
  rows: Record<string, number | string>[]
  series: Slice[]
  xKey: string
  xFormat: (v: string) => string
  index?: number
}) {
  const grid = useGridColor()
  const hues = useMemo(() => hueMap(series), [series])
  const intro = useIntro()
  const hasData = rows.some((r) => series.some((s) => Number(r[s.key]) > 0))
  return (
    <Panel title={title} index={index}>
      {!hasData ? (
        <EmptyPlot />
      ) : (
        <>
          <Legend slices={series} hues={hues} />
          <div className="mt-1 h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
                <CartesianGrid stroke={grid} strokeDasharray="2 4" vertical={false} />
                <XAxis
                  dataKey={xKey}
                  tick={AXIS}
                  tickFormatter={xFormat}
                  axisLine={{ stroke: grid }}
                  tickLine={false}
                  interval="preserveStartEnd"
                  minTickGap={16}
                />
                <YAxis tick={AXIS} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  content={<ChartTooltip labelFormat={xFormat} />}
                  cursor={{ fill: grid, fillOpacity: 0.35 }}
                />
                {series.map((s, i) => (
                  <Bar
                    key={s.key}
                    dataKey={s.key}
                    name={s.label}
                    stackId="a"
                    fill={hues.get(s.key)}
                    // 2px de vão entre segmentos da pilha, mesma razão do donut.
                    stroke="none"
                    strokeWidth={0}
                    maxBarSize={22}
                    // Cada faixa da pilha entra um pouco depois da anterior,
                    // então a barra parece crescer de baixo para cima.
                    isAnimationActive={intro}
                    animationBegin={index * STEP_MS + i * 90}
                    animationDuration={INTRO_MS}
                    animationEasing="ease-out"
                    // Canto arredondado só no topo da pilha, ancorado na base.
                    radius={i === series.length - 1 ? [4, 4, 0, 0] : undefined}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </Panel>
  )
}

// ─── Lead time ────────────────────────────────────────────────────────────────

function LeadTimePanel({
  rows,
  index = 0,
}: {
  rows: { week: string; days: number | null; count: number }[]
  index?: number
}) {
  const grid = useGridColor()
  const intro = useIntro()
  const hasData = rows.some((r) => r.days != null)
  return (
    <Panel title="Lead time — dias entre criação e entrega" index={index}>
      {!hasData ? (
        <EmptyPlot label="Nenhum card entregue no período" />
      ) : (
        <div className="h-[220px]">
          {/* Série única: o título já nomeia a métrica, então não há legenda. */}
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
              <CartesianGrid stroke={grid} strokeDasharray="2 4" vertical={false} />
              <XAxis
                dataKey="week"
                tick={AXIS}
                tickFormatter={shortDay}
                axisLine={{ stroke: grid }}
                tickLine={false}
                minTickGap={16}
              />
              <YAxis tick={AXIS} axisLine={false} tickLine={false} unit="d" />
              <Tooltip content={<ChartTooltip labelFormat={(v) => `Semana de ${shortDay(v)}`} suffix=" dias" />} />
              <Line
                type="monotone"
                dataKey="days"
                name="Média"
                stroke={HUES[0]}
                strokeWidth={2}
                // Semana sem entrega vale `null`: `connectNulls` mentiria ligando
                // dois pontos por cima de um período em que nada foi entregue.
                connectNulls={false}
                dot={{ r: 3, strokeWidth: 0, fill: HUES[0] }}
                activeDot={{ r: 5 }}
                isAnimationActive={intro}
                animationBegin={index * STEP_MS}
                animationDuration={INTRO_MS + 250}
                animationEasing="ease-out"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Panel>
  )
}

// ─── Tabela de detalhes ───────────────────────────────────────────────────────

function DetailsTable({ cards }: { cards: Card[] }) {
  const [query, setQuery] = useState("")
  const q = query.trim().toLowerCase()
  const rows = q
    ? cards.filter(
        (c) => c.title.toLowerCase().includes(q) || c.ref.toLowerCase().includes(q),
      )
    : cards

  return (
    <Panel
      title="Detalhes dos tickets"
      action={
        <label className="relative">
          <Search
            className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-paper-400"
            aria-hidden
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Pesquisar na tabela"
            aria-label="Pesquisar tickets na tabela"
            className="w-52 rounded-md border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-800 py-1 pl-7 pr-2 text-xs text-ink dark:text-paper outline-none focus:border-brand-400"
          />
        </label>
      }
    >
      <div className="max-h-[320px] overflow-y-auto scrollbar-slim">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-paper dark:bg-ink-900">
            <tr className="text-[10px] uppercase tracking-wide text-paper-400">
              <th className="pb-2 pr-3 font-semibold">Chave</th>
              <th className="pb-2 pr-3 font-semibold">Tipo</th>
              <th className="pb-2 pr-3 font-semibold">Prioridade</th>
              <th className="pb-2 font-semibold">Resumo</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr
                key={c.id}
                className="border-t border-paper-100 dark:border-ink-800 align-middle"
              >
                <td className="py-1.5 pr-3 font-mono text-[11px] text-paper-500">{c.ref}</td>
                <td className="py-1.5 pr-3">
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                    <IssueTypeIcon type={c.type} className="size-3.5" />
                    <span className="text-ink dark:text-paper">{TYPE_LABEL[c.type]}</span>
                  </span>
                </td>
                <td className="py-1.5 pr-3">
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                    <PriorityIcon priority={c.priority} className="size-3.5" />
                    <span className="text-paper-500">{PRIORITY_LABEL[c.priority]}</span>
                  </span>
                </td>
                <td className="max-w-0 truncate py-1.5 text-ink dark:text-paper" title={c.title}>
                  {c.title}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="py-8 text-center text-xs text-paper-400">
            Nenhum ticket corresponde a “{query.trim()}”.
          </p>
        )}
      </div>
    </Panel>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export function ResumoDashboard({
  cards,
}: {
  cards: Card[]
}) {
  const statusSlices = useMemo(
    () =>
      topNSlices(
        countBy(
          cards,
          (c) => c.status as CardStatus,
          (k) => STATUS_LABEL[k] ?? k,
        ),
        MAX_SLICES,
      ),
    [cards],
  )

  const prioritySlices = useMemo(
    () =>
      topNSlices(
        countBy(
          cards,
          (c) => c.priority as CardPriority,
          (k) => PRIORITY_LABEL[k] ?? k,
        ),
        MAX_SLICES,
      ),
    [cards],
  )

  const deadlineSlices = useMemo(
    () =>
      countBy(
        cards,
        (card) => {
          if (!card.due_date) return "no_deadline"
          if (isDelivered(card)) return "completed"
          return new Date(card.due_date).getTime() < Date.now() ? "overdue" : "upcoming"
        },
        (key) => ({
          no_deadline: "Sem prazo",
          overdue: "Atrasados",
          upcoming: "Com prazo futuro",
          completed: "Concluídos",
        }[key] ?? key),
      ).sort((a, b) => b.value - a.value),
    [cards],
  )

  // As séries das tendências reusam as fatias já ranqueadas: assim a mesma
  // categoria mantém a mesma cor entre o donut e a pilha. Um card fora do top-N
  // cai em "Outros" nos dois lugares.
  const statusKeys = useMemo(() => new Set(statusSlices.map((s) => s.key)), [statusSlices])
  const priorityKeys = useMemo(() => new Set(prioritySlices.map((s) => s.key)), [prioritySlices])

  const creationRows = useMemo(
    () =>
      creationTrend(
        cards,
        statusSlices.map((s) => s.key),
        (c) => (statusKeys.has(c.status) ? c.status : "__other__"),
        30,
      ),
    [cards, statusSlices, statusKeys],
  )

  const completionRows = useMemo(
    () =>
      completionTrend(
        cards,
        prioritySlices.map((s) => s.key),
        (c) => (priorityKeys.has(c.priority) ? c.priority : "__other__"),
        12,
      ),
    [cards, prioritySlices, priorityKeys],
  )

  const leadRows = useMemo(() => leadTimeByWeek(cards, 12), [cards])

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        {/* `index` monta a escada: cada painel entra logo depois do anterior,
            na ordem de leitura, em vez de tudo aparecer no mesmo quadro. */}
        <DonutPanel title="Tickets por status" slices={statusSlices} index={0} />
        <DonutPanel title="Tickets por prioridade" slices={prioritySlices} index={1} />
        <DonutPanel title="Tickets por prazo" slices={deadlineSlices} index={2} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <StackedTrendPanel
          title="Tendência de criação — últimos 30 dias"
          rows={creationRows}
          series={statusSlices}
          xKey="date"
          xFormat={shortDay}
          index={3}
        />
        <LeadTimePanel rows={leadRows} index={4} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <StackedTrendPanel
          title="Tendência de conclusão — 12 meses"
          rows={completionRows}
          series={prioritySlices}
          xKey="month"
          xFormat={shortMonth}
          index={5}
        />
        <DetailsTable cards={cards} />
      </div>
    </div>
  )
}
