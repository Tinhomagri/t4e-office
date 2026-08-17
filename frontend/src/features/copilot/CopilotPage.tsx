import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { motion } from "framer-motion"
import {
  AlertTriangle,
  Bot,
  Check,
  Clock,
  FileText,
  Gauge,
  KeyRound,
  Lock,
  MessageSquare,
  Minus,
  PieChart as PieIcon,
  Settings2,
  Sparkles,
  SquareStack,
  ThumbsDown,
  ThumbsUp,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react"
import { useEffect, useState } from "react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts"

import { Button, PageHeader, cx } from "@/shared/ui/primitives"
import { useWorkspaces } from "@/features/workspace/workspace.hooks"
import {
  getAiConfig,
  getCopilotMetrics,
  saveAiConfig,
  testAiConfig,
  type AiConfig,
  type AiProvider,
  type CopilotMetrics,
  type CopilotRecentEvent,
  type CopilotTopUser,
  type SeriesPoint,
} from "./copilot.api"

const PROVIDERS: { value: AiProvider; label: string; defaultModel: string; models: string[] }[] = [
  { value: "anthropic", label: "Anthropic (Claude)", defaultModel: "claude-opus-4-8", models: ["claude-opus-4-8", "claude-sonnet-5", "claude-haiku-4-5-20251001"] },
  { value: "openai", label: "OpenAI", defaultModel: "gpt-4o", models: ["gpt-4o", "gpt-4o-mini", "gpt-4.1"] },
  { value: "google", label: "Google (Gemini)", defaultModel: "gemini-2.5-pro", models: ["gemini-2.5-pro", "gemini-2.5-flash"] },
]

const KIND_LABEL: Record<string, string> = {
  chat: "Conversa no chat",
  analyze: "Documento analisado",
  cards: "Cards gerados",
  agent_execute: "Ações do agente executadas",
}
export function CopilotPage() {
  const { activeWorkspaceId } = useWorkspaces()
  const { data: aiConfig } = useQuery({
    queryKey: ["ai-config", activeWorkspaceId],
    queryFn: () => getAiConfig(activeWorkspaceId!),
    enabled: !!activeWorkspaceId,
  })
  const { data: usage, isLoading } = useQuery({
    queryKey: ["copilot-metrics", activeWorkspaceId],
    queryFn: () => getCopilotMetrics(activeWorkspaceId!),
    enabled: !!activeWorkspaceId,
  })

  const aiReady = !!aiConfig?.configured && aiConfig.is_active

  if (!activeWorkspaceId)
    return (
      <div className="py-16 text-center text-sm text-paper-500">
        Crie um workspace na aba Boards primeiro.
      </div>
    )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Relatório do Copiloto"
        subtitle="Avaliação, usabilidade e adoção da IA neste workspace"
      />

      {activeWorkspaceId && <AiIntegrationCard workspaceId={activeWorkspaceId} config={aiConfig ?? null} />}

      {!aiReady ? (
        <EmptyReport
          title="Copiloto ainda não configurado"
          message="Conecte um provedor de IA acima. Assim que a equipe começar a usar o chat e a análise de documentos, o relatório de uso aparece aqui."
        />
      ) : isLoading || !usage ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-ink/5 dark:bg-ink-800" />
          ))}
        </div>
      ) : (
        <Report usage={usage} />
      )}
    </div>
  )
}

// ── Paleta do relatório (categórica, tons distintos) ─────────────────────────
const C = {
  chat: "#6E5DC6", // violet-500 — conversas
  doc: "#8270DB", // indigo-500 — documentos
  card: "#2898BD", // cyan-500 — cards
  up: "#22A06B", // emerald-500 — satisfação
  down: "#E2483D", // rose-500 — insatisfação
}

function Report({ usage }: { usage: CopilotMetrics }) {
  const noData =
    usage.interactions === 0 && usage.cards_created === 0 && usage.total_ratings === 0
  const t = usage.trend

  if (noData)
    return (
      <EmptyReport
        title="Sem uso registrado ainda"
        message="Converse com o Copiloto pelo balão flutuante ou anexe um documento para análise. As métricas de uso e satisfação dos últimos 30 dias aparecem aqui."
      />
    )

  return (
    <div className="space-y-5">
      {/* KPIs com sparkline */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard icon={MessageSquare} label="Interações" value={usage.interactions} trend={t.interactions} accent="violet" series={usage.series} dataKey="interactions" color={C.chat} />
        <KpiCard icon={SquareStack} label="Cards gerados" value={usage.cards_created} trend={t.cards_created} accent="indigo" series={usage.series} dataKey="cards" color={C.card} />
        <KpiCard icon={Users} label="Usuários ativos" value={usage.active_users} trend={t.active_users} accent="sky" />
        <KpiCard
          icon={ThumbsUp}
          label="Satisfação"
          value={usage.satisfaction == null ? "—" : `${usage.satisfaction}%`}
          hint={usage.total_ratings === 0 ? "Sem avaliações" : `${usage.total_ratings} avaliaç${usage.total_ratings === 1 ? "ão" : "ões"}`}
          accent={usage.satisfaction == null ? "violet" : usage.satisfaction >= 70 ? "emerald" : usage.satisfaction >= 40 ? "amber" : "red"}
        />
      </div>

      {/* Atividade (área empilhada) + composição (donut) */}
      <div className="grid gap-4 lg:grid-cols-3">
        <ReportCard title="Atividade ao longo do tempo" icon={Gauge} className="lg:col-span-2" hint={`Últimos ${usage.period_days} dias`}>
          <ActivityArea series={usage.series} />
        </ReportCard>
        <ReportCard title="Composição do uso" icon={PieIcon} hint="Por tipo de ação">
          <CompositionDonut usage={usage} />
        </ReportCard>
      </div>

      {/* Cards gerados (destaque) + satisfação (radial) */}
      <div className="grid gap-4 lg:grid-cols-3">
        <ReportCard title="Cards gerados pela IA" icon={SquareStack} className="lg:col-span-2" hint="Volume por dia">
          <CardsSpotlight usage={usage} />
        </ReportCard>
        <ReportCard title="Satisfação" icon={ThumbsUp} hint="👍 vs 👎">
          <SatisfactionRadial usage={usage} />
        </ReportCard>
      </div>

      {/* Adoção + atividade recente */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ReportCard title="Quem mais usa" icon={Users} hint="Adoção pela equipe">
          <TopUsersBar users={usage.top_users} />
        </ReportCard>
        <ReportCard title="Atividade recente" icon={Clock}>
          <RecentFeed events={usage.recent} />
        </ReportCard>
      </div>
    </div>
  )
}

// ── KPI ──────────────────────────────────────────────────────────────────────
const ACCENTS: Record<string, string> = {
  violet: "from-violet-500 to-purple-600",
  indigo: "from-indigo-500 to-blue-600",
  sky: "from-sky-500 to-cyan-600",
  emerald: "from-emerald-500 to-teal-600",
  amber: "from-amber-500 to-orange-500",
  red: "from-red-500 to-rose-600",
}

function KpiCard({
  icon: Icon,
  label,
  value,
  trend,
  hint,
  accent = "violet",
  series,
  dataKey,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: number | string
  trend?: number | null
  hint?: string
  accent?: string
  series?: SeriesPoint[]
  dataKey?: keyof SeriesPoint
  color?: string
}) {
  const numeric = typeof value === "number"
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="relative overflow-hidden rounded-2xl border border-ink/10 bg-paper p-4 dark:border-ink-700 dark:bg-ink-900"
    >
      <div className="flex items-center justify-between">
        <span className={cx("grid size-8 place-items-center rounded-lg bg-gradient-to-br text-white shadow-sm", ACCENTS[accent])}>
          <Icon className="size-4" />
        </span>
        {trend != null && <TrendBadge value={trend} />}
      </div>
      <div className="mt-3 text-3xl font-bold tabular-nums text-ink dark:text-paper">
        {numeric ? <AnimatedNumber value={value as number} /> : value}
      </div>
      <div className="text-[11px] font-medium uppercase tracking-wide text-paper-500">{label}</div>
      {hint && <div className="mt-0.5 text-[11px] text-paper-400">{hint}</div>}
      {series && dataKey && color && (
        <div className="pointer-events-none mt-2 h-9 opacity-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 2, bottom: 0, left: 0, right: 0 }}>
              <defs>
                <linearGradient id={`spark-${String(dataKey)}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey={dataKey as string} stroke={color} strokeWidth={1.5} fill={`url(#spark-${String(dataKey)})`} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </motion.div>
  )
}

function TrendBadge({ value }: { value: number }) {
  const flat = value === 0
  const up = value > 0
  const Icon = flat ? Minus : up ? TrendingUp : TrendingDown
  const tone = flat ? "text-paper-400" : up ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
  return (
    <span className={cx("flex items-center gap-0.5 rounded-full bg-ink/5 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums dark:bg-white/10", tone)}>
      <Icon className="size-3" />
      {flat ? "0%" : `${up ? "+" : ""}${value}%`}
    </span>
  )
}

// ── Gráfico de atividade (área empilhada) ────────────────────────────────────
function ActivityArea({ series }: { series: SeriesPoint[] }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={series} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <defs>
            {[["chats", C.chat], ["analyses", C.doc], ["cards", C.card]].map(([k, c]) => (
              <linearGradient key={k} id={`g-${k}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={c} stopOpacity={0.55} />
                <stop offset="100%" stopColor={c} stopOpacity={0.04} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-ink/10" />
          <XAxis dataKey="day" tickFormatter={fmtDay} tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={24} axisLine={false} tickLine={false} />
          <YAxis allowDecimals={false} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={28} />
          <RTooltip content={<ChartTooltip />} />
          <Area type="monotone" dataKey="chats" name="Conversas" stackId="1" stroke={C.chat} strokeWidth={2} fill="url(#g-chats)" />
          <Area type="monotone" dataKey="analyses" name="Documentos" stackId="1" stroke={C.doc} strokeWidth={2} fill="url(#g-analyses)" />
          <Area type="monotone" dataKey="cards" name="Cards" stackId="1" stroke={C.card} strokeWidth={2} fill="url(#g-cards)" />
        </AreaChart>
      </ResponsiveContainer>
      <div className="mt-1 flex flex-wrap gap-4 text-xs text-paper-500">
        <Legend swatch={C.chat} label="Conversas" />
        <Legend swatch={C.doc} label="Documentos" />
        <Legend swatch={C.card} label="Cards" />
      </div>
    </div>
  )
}

// ── Donut de composição ──────────────────────────────────────────────────────
function CompositionDonut({ usage }: { usage: CopilotMetrics }) {
  const data = usage.by_kind.filter((k) => k.value > 0)
  const colors: Record<string, string> = { chat: C.chat, analyze: C.doc, cards: C.card }
  const total = data.reduce((s, d) => s + d.value, 0)

  if (total === 0) return <p className="py-10 text-center text-xs text-paper-400">Sem dados no período.</p>

  return (
    <div className="relative h-64">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="label" innerRadius={58} outerRadius={88} paddingAngle={3} stroke="none">
            {data.map((d) => (
              <Cell key={d.key} fill={colors[d.key] ?? C.chat} />
            ))}
          </Pie>
          <RTooltip content={<ChartTooltip suffix="" />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold tabular-nums text-ink dark:text-paper">{total}</span>
        <span className="text-[10px] uppercase tracking-wide text-paper-400">ações</span>
      </div>
      <div className="mt-1 flex flex-wrap justify-center gap-3 text-xs text-paper-500">
        {data.map((d) => (
          <Legend key={d.key} swatch={colors[d.key] ?? C.chat} label={`${d.label} (${d.value})`} />
        ))}
      </div>
    </div>
  )
}

// ── Destaque de cards gerados ────────────────────────────────────────────────
function CardsSpotlight({ usage }: { usage: CopilotMetrics }) {
  const totalInteractions = usage.interactions || 1
  const rate = Math.round((usage.cards_created / totalInteractions) * 100)
  return (
    <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
      <div className="flex flex-col justify-center gap-1 rounded-xl bg-gradient-to-br from-cyan-500/10 to-blue-500/5 p-4">
        <span className="text-4xl font-bold tabular-nums text-cyan-600 dark:text-cyan-400">
          <AnimatedNumber value={usage.cards_created} />
        </span>
        <span className="text-[11px] uppercase tracking-wide text-paper-500">cards criados</span>
        <span className="mt-1 text-[11px] text-paper-400">≈ {rate}% das interações viram card</span>
      </div>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={usage.series} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-ink/10" />
            <XAxis dataKey="day" tickFormatter={fmtDay} tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={24} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={28} />
            <RTooltip content={<ChartTooltip />} cursor={{ fill: "rgba(6,182,212,0.08)" }} />
            <Bar dataKey="cards" name="Cards" fill={C.card} radius={[4, 4, 0, 0]} maxBarSize={22} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ── Satisfação (radial) ──────────────────────────────────────────────────────
function SatisfactionRadial({ usage }: { usage: CopilotMetrics }) {
  const up = usage.thumbs_up
  const down = usage.thumbs_down
  const total = up + down
  const pct = usage.satisfaction ?? 0

  if (total === 0)
    return (
      <div className="flex h-56 flex-col items-center justify-center gap-2 text-center">
        <ThumbsUp className="size-7 text-paper-300" />
        <p className="text-xs text-paper-400">Ainda sem avaliações. Peça ao time para reagir 👍/👎 nas respostas do Copiloto.</p>
      </div>
    )

  const tone = pct >= 70 ? C.up : pct >= 40 ? "#E2B203" : C.down
  const data = [{ name: "sat", value: pct, fill: tone }]
  return (
    <div className="relative">
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart data={data} startAngle={220} endAngle={-40} innerRadius="70%" outerRadius="100%">
            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
            <RadialBar dataKey="value" cornerRadius={12} background={{ fill: "rgba(120,120,120,0.12)" }} />
          </RadialBarChart>
        </ResponsiveContainer>
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 flex-col items-center">
        <span className="text-4xl font-bold tabular-nums" style={{ color: tone }}>{pct}%</span>
        <span className="text-[10px] uppercase tracking-wide text-paper-400">satisfação</span>
      </div>
      <div className="-mt-4 flex items-center justify-center gap-6 text-xs">
        <span className="flex items-center gap-1.5 text-emerald-600"><ThumbsUp className="size-3.5" /> {up}</span>
        <span className="flex items-center gap-1.5 text-rose-500"><ThumbsDown className="size-3.5" /> {down}</span>
      </div>
    </div>
  )
}

// ── Top usuários (barra horizontal) ──────────────────────────────────────────
function TopUsersBar({ users }: { users: CopilotTopUser[] }) {
  if (users.length === 0) return <p className="py-6 text-center text-xs text-paper-400">Sem usuários ativos no período.</p>
  const data = users.map((u) => ({ ...u, short: u.name.length > 16 ? u.name.slice(0, 15) + "…" : u.name }))
  return (
    <div style={{ height: Math.max(120, data.length * 44) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
          <XAxis type="number" allowDecimals={false} hide />
          <YAxis type="category" dataKey="short" width={96} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
          <RTooltip content={<ChartTooltip />} cursor={{ fill: "rgba(139,92,246,0.08)" }} />
          <Bar dataKey="count" name="Interações" fill={C.chat} radius={[0, 6, 6, 0]} maxBarSize={24} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function RecentFeed({ events }: { events: CopilotRecentEvent[] }) {
  if (events.length === 0) return <p className="py-6 text-center text-xs text-paper-400">Nenhuma atividade recente.</p>
  return (
    <ul className="space-y-2.5">
      {events.map((e, i) => (
        <li key={i} className="flex items-center gap-3 text-sm">
          <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-violet-100 text-violet-600 dark:bg-violet-500/20 dark:text-violet-300">
            {iconForKind(e.kind)}
          </span>
          <div className="min-w-0 flex-1">
            <span className="text-ink dark:text-paper">
              {KIND_LABEL[e.kind] ?? e.kind}
              {e.count > 0 && e.kind !== "chat" ? ` (${e.count})` : ""}
            </span>
            <span className="ml-1 text-paper-400">· {e.actor}</span>
          </div>
          <span className="shrink-0 text-[11px] text-paper-400">{fmtTime(e.at)}</span>
        </li>
      ))}
    </ul>
  )
}

// ── Blocos auxiliares ────────────────────────────────────────────────────────
function ReportCard({
  title,
  icon: Icon,
  hint,
  className,
  children,
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  hint?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cx("rounded-2xl border border-ink/10 bg-paper p-5 dark:border-ink-700 dark:bg-ink-900", className)}>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-ink dark:text-paper">
          <Icon className="size-4 text-violet-500" /> {title}
        </h3>
        {hint && <span className="text-[11px] text-paper-400">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

function ChartTooltip({ active, payload, label, suffix }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-ink/10 bg-paper/95 px-3 py-2 text-xs shadow-lg backdrop-blur dark:border-ink-700 dark:bg-ink-900/95">
      {label != null && <div className="mb-1 font-medium text-paper-500">{fmtDayLong(String(label))}</div>}
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <span className="size-2 rounded-sm" style={{ background: p.color || p.payload?.fill }} />
          <span className="text-ink dark:text-paper">{p.name}</span>
          <span className="ml-auto font-semibold tabular-nums text-ink dark:text-paper">
            {p.value}
            {suffix ?? ""}
          </span>
        </div>
      ))}
    </div>
  )
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="size-2.5 rounded-sm" style={{ background: swatch }} /> {label}
    </span>
  )
}

function EmptyReport({ title, message }: { title: string; message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-ink/15 bg-paper p-10 text-center dark:border-ink-700 dark:bg-ink-900">
      <span className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white">
        <Sparkles className="size-6" />
      </span>
      <h3 className="text-sm font-semibold text-ink dark:text-paper">{title}</h3>
      <p className="mx-auto mt-1 max-w-md text-xs text-paper-500">{message}</p>
    </div>
  )
}

// ── Utilitários ──────────────────────────────────────────────────────────────
function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    let raf = 0
    const start = performance.now()
    const dur = 700
    const from = 0
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / dur)
      const eased = 1 - Math.pow(1 - p, 3)
      setDisplay(Math.round(from + (value - from) * eased))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value])
  return <>{display.toLocaleString("pt-BR")}</>
}

function fmtDay(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
}

function fmtDayLong(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
}

function fmtTime(iso: string): string {
  const d = new Date(iso)
  const diff = (Date.now() - d.getTime()) / 1000
  if (diff < 60) return "agora"
  if (diff < 3600) return `${Math.floor(diff / 60)}min`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
}

function iconForKind(kind: string) {
  if (kind === "chat") return <MessageSquare className="size-3.5" />
  if (kind === "analyze") return <FileText className="size-3.5" />
  return <SquareStack className="size-3.5" />
}

function AiIntegrationCard({ workspaceId, config }: { workspaceId: string; config: AiConfig | null }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [provider, setProvider] = useState<AiProvider>("anthropic")
  const [model, setModel] = useState("claude-opus-4-8")
  const [apiKey, setApiKey] = useState("")
  const [active, setActive] = useState(true)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // Sincroniza o formulário quando a config carrega/atualiza.
  useEffect(() => {
    if (!config) return
    setProvider(config.provider)
    setModel(config.model)
    setActive(config.is_active)
  }, [config])

  const providerMeta = PROVIDERS.find((p) => p.value === provider) ?? PROVIDERS[0]
  const canEdit = config?.can_edit ?? false

  const save = useMutation({
    mutationFn: () =>
      saveAiConfig(workspaceId, {
        provider,
        model: model || providerMeta.defaultModel,
        api_key: apiKey || undefined,
        is_active: active,
      }),
    onSuccess: () => {
      setApiKey("")
      setMsg({ ok: true, text: "Configuração salva." })
      qc.invalidateQueries({ queryKey: ["ai-config", workspaceId] })
    },
    onError: (e) => setMsg({ ok: false, text: errMsg(e) }),
  })

  const test = useMutation({
    mutationFn: () => testAiConfig(workspaceId),
    onSuccess: (r) =>
      setMsg(r.ok ? { ok: true, text: "Conexão com a IA funcionando!" } : { ok: false, text: r.error ?? "Falhou." }),
    onError: (e) => setMsg({ ok: false, text: errMsg(e) }),
  })

  const configured = !!config?.configured
  const activeOk = configured && config?.is_active

  return (
    <div className="rounded-2xl border border-ink/10 bg-paper dark:bg-ink-900">
      {/* Cabeçalho / status */}
      <div className="flex items-center justify-between gap-3 p-5">
        <div className="flex items-center gap-3">
          <span className={cx(
            "grid size-10 place-items-center rounded-xl bg-gradient-to-br text-white shadow-sm",
            activeOk ? "from-emerald-500 to-teal-600" : "from-violet-500 to-purple-700",
          )}>
            <Bot className="size-5" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-ink dark:text-paper">Integração de IA</h3>
              <span className={cx(
                "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                activeOk
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                  : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
              )}>
                {activeOk ? "Conectado" : "Não configurado"}
              </span>
            </div>
            <p className="text-xs text-paper-500">
              {configured
                ? `${PROVIDERS.find((p) => p.value === config?.provider)?.label} · ${config?.model} · chave ${config?.key_hint}`
                : "Conecte OpenAI ou Claude com a chave da sua própria conta para este workspace."}
            </p>
          </div>
        </div>
        {canEdit ? (
          <Button variant="outline" onClick={() => { setMsg(null); setOpen((v) => !v) }}>
            <Settings2 className="size-4" /> {open ? "Fechar" : configured ? "Editar" : "Configurar"}
          </Button>
        ) : (
          <span className="flex items-center gap-1.5 text-xs text-paper-400">
            <Lock className="size-3.5" /> Só administradores
          </span>
        )}
      </div>

      {/* Formulário (admins) */}
      {open && canEdit && (
        <div className="space-y-4 border-t border-ink/10 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-paper-500">Provedor</span>
              <select
                value={provider}
                onChange={(e) => { const p = e.target.value as AiProvider; setProvider(p); setModel(PROVIDERS.find((x) => x.value === p)!.defaultModel) }}
                className="w-full rounded-lg border border-ink/15 bg-paper-100 dark:bg-ink-800 px-3 py-2 text-sm"
              >
                {PROVIDERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-paper-500">Modelo</span>
              <select
                value={providerMeta.models.includes(model) ? model : "__custom__"}
                onChange={(e) => setModel(e.target.value === "__custom__" ? "" : e.target.value)}
                className="w-full rounded-lg border border-ink/15 bg-paper-100 dark:bg-ink-800 px-3 py-2 text-sm"
              >
                {providerMeta.models.map((m) => <option key={m} value={m}>{m}</option>)}
                <option value="__custom__">Outro (digitar manualmente)…</option>
              </select>
              {!providerMeta.models.includes(model) && (
                <input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder={providerMeta.defaultModel}
                  className="mt-2 w-full rounded-lg border border-ink/15 bg-paper-100 dark:bg-ink-800 px-3 py-2 text-sm"
                />
              )}
            </label>
          </div>

          <label className="block">
            <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-paper-500">
              <KeyRound className="size-3.5" /> Chave de API {configured && "(deixe em branco para manter a atual)"}
            </span>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={provider === "openai" ? "sk-..." : "sk-ant-..."}
              autoComplete="off"
              className="w-full rounded-lg border border-ink/15 bg-paper-100 dark:bg-ink-800 px-3 py-2 font-mono text-sm"
            />
            <span className="mt-1 block text-[11px] text-paper-400">
              A chave é cifrada no servidor e nunca é exibida de volta.
            </span>
          </label>

          <label className="flex items-center gap-2 text-sm text-paper-600">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="size-4" />
            Integração ativa
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!configured && !apiKey}>
              Salvar
            </Button>
            <Button variant="outline" onClick={() => test.mutate()} loading={test.isPending} disabled={!configured}>
              Testar conexão
            </Button>
            {msg && (
              <span className={cx("flex items-center gap-1.5 text-sm", msg.ok ? "text-emerald-600" : "text-red-600")}>
                {msg.ok ? <Check className="size-4" /> : <AlertTriangle className="size-4" />} {msg.text}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function errMsg(e: unknown): string {
  const anyE = e as { response?: { data?: { error?: string; detail?: string } } }
  return (
    anyE?.response?.data?.error ??
    anyE?.response?.data?.detail ??
    "Não foi possível concluir. Verifique se o Copiloto IA está configurado."
  )
}
