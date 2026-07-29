import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Download,
  Gauge,
  Layers,
  LineChart as LineChartIcon,
  Printer,
  Target,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { useMemo, useState } from "react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { ColoredAvatar } from "@/features/boards/board.shared"
import {
  useMembers,
  useProjectReports,
  useProjects,
  useCards,
  useWorkspaces,
} from "@/features/workspace/workspace.hooks"
import type { ProjectReports } from "@/features/workspace/workspace.api"
import type { Card, CardPriority, CardStatus, CardType, Member } from "@/features/workspace/workspace.types"
import { Button, PageHeader, Select, Spinner, cx } from "@/shared/ui/primitives"

// ── Paleta (estilo Power BI) ────────────────────────────────────────────────
const BRAND = "#6c5cf0"

// Relatório vazio — usado quando o workspace não tem projeto ativo, pra
// mostrar a mesma UI (com estados vazios de cada gráfico) em vez de sumir com tudo.
const EMPTY_REPORTS: ProjectReports = {
  burndown: { sprint: null, ideal: [], actual: [] },
  velocity: [],
  cfd: [],
}

const STATUS_ORDER: CardStatus[] = ["backlog", "todo", "doing", "review", "done"]
const STATUS_LABEL: Record<CardStatus, string> = {
  backlog: "Backlog", todo: "A fazer", doing: "Em andamento", review: "Em revisão", done: "Concluído",
  briefing: "Briefing", criacao: "Criação", aprovacao: "Aprovação", agendado: "Agendado", publicado: "Publicado",
}
const STATUS_COLOR: Record<CardStatus, string> = {
  backlog: "#94a3b8", todo: "#818cf8", doing: "#6c5cf0", review: "#a855f7", done: "#16a34a",
  briefing: "#8b5cf6", criacao: "#6c5cf0", aprovacao: "#f59e0b", agendado: "#06b6d4", publicado: "#16a34a",
}
const TYPE_LABEL: Record<CardType, string> = {
  feature: "Feature", bug: "Bug", debt: "Débito", spike: "Spike", chore: "Tarefa", epic: "Épico",
  post: "Post", peca: "Peça", campanha: "Campanha", artigo: "Artigo", email: "E-mail",
}
const TYPE_COLOR: Record<CardType, string> = {
  feature: "#6c5cf0", bug: "#ef4444", debt: "#f97316", spike: "#06b6d4", chore: "#94a3b8", epic: "#a855f7",
  post: "#6c5cf0", peca: "#94a3b8", campanha: "#a855f7", artigo: "#f97316", email: "#f59e0b",
}
const PRIORITY_ORDER: CardPriority[] = ["urgent", "high", "medium", "low"]
const PRIORITY_LABEL: Record<CardPriority, string> = {
  low: "Baixa", medium: "Média", high: "Alta", urgent: "Urgente",
}
const PRIORITY_COLOR: Record<CardPriority, string> = {
  low: "#94a3b8", medium: "#6c5cf0", high: "#f59e0b", urgent: "#ef4444",
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function weekStart(iso: string): string {
  const d = new Date(iso)
  const day = (d.getDay() + 6) % 7 // segunda = 0
  d.setDate(d.getDate() - day)
  d.setHours(0, 0, 0, 0)
  return d.toISOString().slice(0, 10)
}
function fmtWeek(iso: string): string {
  const d = new Date(iso + "T00:00:00")
  return `${d.getDate()}/${d.getMonth() + 1}`
}
function fmtDay(iso: string): string {
  return iso.slice(5).replace("-", "/")
}
function isOverdue(c: Card): boolean {
  if (!c.due_date || c.status === "done") return false
  const d = new Date(c.due_date + "T00:00:00")
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return d.getTime() < today.getTime()
}

// ══════════════════════════════════════════════════════════════════════════════
export function ReportsPage() {
  const { activeWorkspaceId } = useWorkspaces()
  const { data: projects, isLoading: projectsLoading } = useProjects(activeWorkspaceId)
  const { data: members } = useMembers(activeWorkspaceId)
  const [projectId, setProjectId] = useState<string | null>(null)
  const pid = projectId ?? projects?.[0]?.id ?? null

  const { data: reports, isLoading: reportsLoading } = useProjectReports(pid)
  const { data: cards, isLoading: cardsLoading } = useCards(pid)

  const project = projects?.find((p) => p.id === pid) ?? null
  // Sem projeto: os hooks de reports/cards ficam desabilitados (enabled: !!pid) e
  // nunca resolvem — usamos dados vazios pra renderizar a mesma UI zerada, em vez
  // de trocar a página inteira por uma mensagem.
  const noProject = !projectsLoading && !pid
  const isLoading = projectsLoading || (!!pid && (reportsLoading || cardsLoading))
  const reportsData = pid ? reports : EMPTY_REPORTS
  const cardsData = pid ? cards : []

  const memberName = useMemo(() => {
    const map = new Map<string, string>((members ?? []).map((m: Member) => [m.user_id, m.name]))
    return (id: string | null) => (id && map.get(id)) || "Não atribuído"
  }, [members])

  return (
    <div className="w-full space-y-6 print:px-0">
      <PageHeader
        eyebrow={<><LineChartIcon className="size-4 text-brand-500" /><span>Relatórios</span></>}
        title="Central de Relatórios"
        subtitle={project ? `${project.key} — ${project.name}` : "Métricas ágeis, fluxo e desempenho do projeto."}
      >
        <div className="flex items-center gap-2">
          {projects && projects.length > 1 && (
            <Select value={pid ?? ""} onChange={(e) => setProjectId(e.target.value)} className="min-w-[180px]">
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.key} — {p.name}</option>
              ))}
            </Select>
          )}
          <Button
            variant="ghost"
            onClick={() => cardsData && project && exportCsv(cardsData, project.key, memberName)}
            disabled={!cardsData?.length}
          >
            <Download className="size-4" /> CSV
          </Button>
          <Button variant="ghost" onClick={() => window.print()} className="print:hidden">
            <Printer className="size-4" /> Imprimir
          </Button>
        </div>
      </PageHeader>

      {noProject && (
        <p className="-mt-2 flex items-center gap-1.5 text-xs text-paper-400">
          <Layers className="size-3.5" /> Nenhum projeto neste workspace ainda — crie um em Boards para ver dados reais aqui.
        </p>
      )}

      {isLoading || !reportsData || !cardsData ? (
        <div className="flex justify-center py-24"><Spinner className="size-6" /></div>
      ) : (
        <ReportBody reports={reportsData} cards={cardsData} memberName={memberName} />
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
function ReportBody({
  reports,
  cards,
  memberName,
}: {
  reports: ProjectReports
  cards: Card[]
  memberName: (id: string | null) => string
}) {
  const m = useMemo(() => computeMetrics(reports, cards), [reports, cards])

  return (
    <div className="space-y-5">
      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Kpi icon={Layers} tint="from-slate-500 to-slate-700" label="Cards totais" value={m.total} sub="no projeto" />
        <Kpi icon={CheckCircle2} tint="from-emerald-500 to-green-700" label="Concluídos" value={m.done} sub={`${m.donePct}% do total`} />
        <Kpi icon={Zap} tint="from-violet-500 to-purple-700" label="Peso entregue" value={m.donePoints} sub={`de ${m.totalPoints} de peso`} />
        <Kpi icon={Gauge} tint="from-indigo-500 to-blue-700" label="Velocidade média" value={m.avgVel} sub="peso / sprint" />
        <Kpi icon={TrendingUp} tint="from-amber-500 to-orange-700" label="Em progresso" value={m.wip} sub="doing + review" />
        <Kpi icon={AlertTriangle} tint="from-rose-500 to-red-700" label="Vencidos" value={m.overdue} sub="prazo estourado" />
      </div>

      {/* ── Linha 1: Burndown (largo) + Velocidade ── */}
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <BurndownChart data={reports.burndown} />
        </div>
        <VelocityChart data={reports.velocity} />
      </div>

      {/* ── Linha 2: Throughput (largo) + Status donut ── */}
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ThroughputChart data={m.throughput} />
        </div>
        <StatusDonut data={m.byStatus} total={m.total} />
      </div>

      {/* ── Linha 3: Tipo + Prioridade + Carga por responsável ── */}
      <div className="grid gap-5 lg:grid-cols-3">
        <TypeDonut data={m.byType} />
        <PriorityBars data={m.byPriority} total={m.total} />
        <WorkloadChart data={m.byAssignee} memberName={memberName} />
      </div>

      {/* ── Cards em risco ── */}
      <RiskTable cards={m.risk} memberName={memberName} />
    </div>
  )
}

// ── Cálculo central de métricas ────────────────────────────────────────────────
function computeMetrics(reports: ProjectReports, cards: Card[]) {
  const total = cards.length
  const done = cards.filter((c) => c.status === "done").length
  const wip = cards.filter((c) => c.status === "doing" || c.status === "review").length
  const overdue = cards.filter(isOverdue).length
  const totalPoints = cards.reduce((s, c) => s + (c.points ?? 0), 0)
  const donePoints = cards.filter((c) => c.status === "done").reduce((s, c) => s + (c.points ?? 0), 0)
  const avgVel = reports.velocity.length
    ? Math.round(reports.velocity.reduce((s, d) => s + d.delivered, 0) / reports.velocity.length)
    : 0

  const byStatus = STATUS_ORDER.map((s) => ({
    key: s, label: STATUS_LABEL[s], color: STATUS_COLOR[s],
    count: cards.filter((c) => c.status === s).length,
  }))
  const byType = (Object.keys(TYPE_LABEL) as CardType[])
    .map((t) => ({ key: t, label: TYPE_LABEL[t], color: TYPE_COLOR[t], count: cards.filter((c) => c.type === t).length }))
    .filter((d) => d.count > 0)
  const byPriority = PRIORITY_ORDER.map((p) => ({
    key: p, label: PRIORITY_LABEL[p], color: PRIORITY_COLOR[p],
    count: cards.filter((c) => c.priority === p).length,
  }))

  // Carga por responsável (top 8 por peso)
  const assigneeMap = new Map<string, { id: string | null; count: number; points: number; done: number }>()
  for (const c of cards) {
    const k = c.assignee_id ?? "__none__"
    const cur = assigneeMap.get(k) ?? { id: c.assignee_id, count: 0, points: 0, done: 0 }
    cur.count += 1
    cur.points += c.points ?? 0
    if (c.status === "done") cur.done += 1
    assigneeMap.set(k, cur)
  }
  const byAssignee = [...assigneeMap.values()]
    .sort((a, b) => b.points - a.points || b.count - a.count)
    .slice(0, 8)

  // Throughput: criados vs concluídos por semana (últimas 8 semanas)
  const weeks: string[] = []
  {
    const base = new Date(); base.setHours(0, 0, 0, 0)
    const start = weekStart(base.toISOString())
    for (let i = 7; i >= 0; i--) {
      const d = new Date(start + "T00:00:00")
      d.setDate(d.getDate() - i * 7)
      weeks.push(d.toISOString().slice(0, 10))
    }
  }
  const created = new Map<string, number>()
  const completed = new Map<string, number>()
  for (const c of cards) {
    if (c.created_at) {
      const w = weekStart(c.created_at)
      created.set(w, (created.get(w) ?? 0) + 1)
    }
    if (c.status === "done" && c.updated_at) {
      const w = weekStart(c.updated_at)
      completed.set(w, (completed.get(w) ?? 0) + 1)
    }
  }
  const throughput = weeks.map((w) => ({
    week: w, criados: created.get(w) ?? 0, concluidos: completed.get(w) ?? 0,
  }))

  // Cards em risco: vencidos ou sem estimativa (não concluídos) — priorizados
  const risk = cards
    .filter((c) => c.status !== "done" && (isOverdue(c) || c.points == null || c.points === 0))
    .sort((a, b) => (isOverdue(b) ? 1 : 0) - (isOverdue(a) ? 1 : 0))
    .slice(0, 12)

  return {
    total, done, wip, overdue, totalPoints, donePoints, avgVel,
    donePct: total ? Math.round((done / total) * 100) : 0,
    byStatus, byType, byPriority, byAssignee, throughput, risk,
  }
}

// ── KPI tile ───────────────────────────────────────────────────────────────────
function Kpi({ icon: Icon, tint, label, value, sub }: {
  icon: LucideIcon; tint: string; label: string; value: number; sub: string
}) {
  return (
    <div className="surface relative overflow-hidden p-4">
      <div className={cx("absolute inset-x-0 top-0 h-1 bg-gradient-to-r", tint)} />
      <div className="flex items-center justify-between">
        <span className={cx("inline-flex size-9 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm", tint)}>
          <Icon className="size-[18px]" strokeWidth={2} />
        </span>
      </div>
      <p className="mt-3 text-2xl font-bold tabular leading-none text-ink dark:text-paper">{value}</p>
      <p className="mt-1 text-[12px] font-semibold text-ink dark:text-paper">{label}</p>
      <p className="text-[11px] text-paper-400">{sub}</p>
    </div>
  )
}

// ── Card wrapper ─────────────────────────────────────────────────────────────
function ChartCard({ title, icon: Icon, action, children }: {
  title: string; icon: LucideIcon; action?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <div className="surface flex h-full flex-col p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon className="size-4 text-brand-500" strokeWidth={2} />
          <h3 className="text-sm font-semibold text-ink dark:text-paper">{title}</h3>
        </div>
        {action}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  )
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex h-[240px] items-center justify-center rounded-xl border border-dashed border-paper-200 text-sm text-paper-400 dark:border-ink-700">
      {label}
    </div>
  )
}

// ── Tooltip custom (dark-aware) ───────────────────────────────────────────────
function TT({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-paper-200 bg-paper/95 px-3 py-2 text-xs shadow-lg backdrop-blur dark:border-ink-700 dark:bg-ink-900/95">
      {label != null && <p className="mb-1 font-semibold text-ink dark:text-paper">{label}</p>}
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <span className="size-2 rounded-full" style={{ backgroundColor: p.color || p.payload?.color }} />
          <span className="text-paper-500">{p.name}:</span>
          <span className="font-semibold tabular text-ink dark:text-paper">{p.value}</span>
        </div>
      ))}
    </div>
  )
}

// ── Burndown ───────────────────────────────────────────────────────────────────
function BurndownChart({ data }: { data: ProjectReports["burndown"] }) {
  const rows = useMemo(() => {
    if (!data.sprint || data.ideal.length === 0) return []
    return data.ideal.map((d, i) => ({
      date: d.date,
      ideal: Math.round(d.points),
      real: data.actual[i] ? Math.round(data.actual[i].points) : null,
    }))
  }, [data])

  return (
    <ChartCard
      title={data.sprint ? `Burndown — ${data.sprint.name}` : "Burndown"}
      icon={LineChartIcon}
      action={data.sprint && (
        <span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-[11px] font-semibold text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
          peso {data.sprint.total_points}
        </span>
      )}
    >
      {rows.length === 0 ? (
        <EmptyChart label="Nenhuma sprint ativa ou encerrada com datas." />
      ) : (
        <>
          <div className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ top: 5, right: 8, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="burn" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={BRAND} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={BRAND} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.15} />
                <XAxis dataKey="date" tickFormatter={fmtDay} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={24} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={34} />
                <Tooltip content={<TT />} labelFormatter={(v) => fmtDay(String(v))} />
                <Line type="monotone" dataKey="ideal" name="Ideal" stroke="#94a3b8" strokeDasharray="4 4" strokeWidth={1.5} dot={false} />
                <Line type="monotone" dataKey="real" name="Real" stroke={BRAND} strokeWidth={2.5} dot={{ r: 2.5 }} activeDot={{ r: 4 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <Legend items={[
            { color: "#94a3b8", label: "Ideal", dashed: true },
            { color: BRAND, label: "Real" },
          ]} />
        </>
      )}
    </ChartCard>
  )
}

// ── Velocidade ─────────────────────────────────────────────────────────────────
function VelocityChart({ data }: { data: ProjectReports["velocity"] }) {
  const rows = data.map((d) => ({ ...d, name: d.sprint.replace(/sprint\s*/i, "S") }))
  const avg = data.length ? Math.round(data.reduce((s, d) => s + d.delivered, 0) / data.length) : 0

  return (
    <ChartCard title="Velocidade" icon={TrendingUp}
      action={data.length > 0 && <span className="text-[11px] text-paper-400">peso médio {avg}</span>}>
      {data.length === 0 ? (
        <EmptyChart label="Nenhuma sprint encerrada." />
      ) : (
        <>
          <div className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} margin={{ top: 5, right: 8, left: -18, bottom: 0 }} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.15} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={34} />
                <Tooltip content={<TT />} cursor={{ fill: "rgba(108,92,240,0.06)" }} />
                <ReferenceLine y={avg} stroke={BRAND} strokeDasharray="4 3" strokeWidth={1} />
                <Bar dataKey="committed" name="Comprometido" fill="#d8d8e0" radius={[3, 3, 0, 0]} />
                <Bar dataKey="delivered" name="Entregue" fill={BRAND} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <Legend items={[
            { color: "#d8d8e0", label: "Comprometido" },
            { color: BRAND, label: "Entregue" },
          ]} />
        </>
      )}
    </ChartCard>
  )
}

// ── Throughput ─────────────────────────────────────────────────────────────────
function ThroughputChart({ data }: { data: { week: string; criados: number; concluidos: number }[] }) {
  const has = data.some((d) => d.criados > 0 || d.concluidos > 0)
  return (
    <ChartCard title="Vazão — criados vs. concluídos" icon={BarChart3}
      action={<span className="text-[11px] text-paper-400">últimas 8 semanas</span>}>
      {!has ? (
        <EmptyChart label="Sem atividade suficiente para calcular a vazão." />
      ) : (
        <>
          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 5, right: 8, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="cr" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#818cf8" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#818cf8" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="cc" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#16a34a" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#16a34a" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.15} />
                <XAxis dataKey="week" tickFormatter={fmtWeek} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={30} allowDecimals={false} />
                <Tooltip content={<TT />} labelFormatter={(v) => `Semana de ${fmtWeek(String(v))}`} />
                <Area type="monotone" dataKey="criados" name="Criados" stroke="#818cf8" strokeWidth={2} fill="url(#cr)" />
                <Area type="monotone" dataKey="concluidos" name="Concluídos" stroke="#16a34a" strokeWidth={2} fill="url(#cc)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <Legend items={[
            { color: "#818cf8", label: "Criados" },
            { color: "#16a34a", label: "Concluídos" },
          ]} />
        </>
      )}
    </ChartCard>
  )
}

// ── Donuts ─────────────────────────────────────────────────────────────────────
function StatusDonut({ data, total }: { data: { key: string; label: string; color: string; count: number }[]; total: number }) {
  const rows = data.filter((d) => d.count > 0)
  return (
    <ChartCard title="Distribuição por status" icon={Layers}>
      {total === 0 ? <EmptyChart label="Sem cards." /> : (
        <Donut rows={rows} total={total} centerLabel="cards" />
      )}
    </ChartCard>
  )
}

function TypeDonut({ data }: { data: { key: string; label: string; color: string; count: number }[] }) {
  const total = data.reduce((s, d) => s + d.count, 0)
  return (
    <ChartCard title="Tipos de trabalho" icon={Target}>
      {total === 0 ? <EmptyChart label="Sem cards." /> : (
        <Donut rows={data} total={total} centerLabel="cards" />
      )}
    </ChartCard>
  )
}

function Donut({ rows, total, centerLabel }: {
  rows: { label: string; color: string; count: number }[]; total: number; centerLabel: string
}) {
  return (
    <div className="flex items-center gap-4">
      <div className="relative h-[180px] w-[180px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={rows} dataKey="count" nameKey="label" innerRadius={54} outerRadius={80} paddingAngle={2} stroke="none">
              {rows.map((r, i) => <Cell key={i} fill={r.color} />)}
            </Pie>
            <Tooltip content={<TT />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold tabular text-ink dark:text-paper">{total}</span>
          <span className="text-[10px] text-paper-400">{centerLabel}</span>
        </div>
      </div>
      <ul className="flex-1 space-y-1.5">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-2 text-xs">
            <span className="size-2.5 rounded-sm" style={{ backgroundColor: r.color }} />
            <span className="flex-1 truncate text-paper-500">{r.label}</span>
            <span className="font-semibold tabular text-ink dark:text-paper">{r.count}</span>
            <span className="w-8 text-right text-[10px] text-paper-400 tabular">{Math.round((r.count / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ── Prioridade ───────────────────────────────────────────────────────────────
function PriorityBars({ data, total }: { data: { key: string; label: string; color: string; count: number }[]; total: number }) {
  const max = Math.max(...data.map((d) => d.count), 1)
  return (
    <ChartCard title="Prioridades" icon={AlertTriangle}>
      {total === 0 ? <EmptyChart label="Sem cards." /> : (
        <div className="space-y-3 py-2">
          {data.map((d) => (
            <div key={d.key}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-paper-500">{d.label}</span>
                <span className="font-semibold tabular text-ink dark:text-paper">{d.count}</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-paper-100 dark:bg-ink-800">
                <div className="h-full rounded-full transition-all" style={{ width: `${(d.count / max) * 100}%`, backgroundColor: d.color }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </ChartCard>
  )
}

// ── Carga por responsável ─────────────────────────────────────────────────────
function WorkloadChart({ data, memberName }: {
  data: { id: string | null; count: number; points: number; done: number }[]
  memberName: (id: string | null) => string
}) {
  const maxPts = Math.max(...data.map((d) => d.points), 1)
  return (
    <ChartCard title="Carga por responsável" icon={Users}>
      {data.length === 0 ? <EmptyChart label="Sem cards." /> : (
        <div className="space-y-3 py-1">
          {data.map((d) => {
            const name = memberName(d.id)
            const pct = d.count ? Math.round((d.done / d.count) * 100) : 0
            return (
              <div key={d.id ?? "none"} className="flex items-center gap-2.5">
                <ColoredAvatar name={name} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 flex items-center justify-between gap-2 text-xs">
                    <span className="truncate text-ink dark:text-paper">{name}</span>
                    <span className="shrink-0 text-paper-400">{d.count} cards · {pct}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-paper-100 dark:bg-ink-800">
                    <div className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600" style={{ width: `${(d.points / maxPts) * 100}%` }} />
                  </div>
                </div>
                <span className="w-12 shrink-0 text-right text-[11px] font-semibold tabular text-brand-600 dark:text-brand-300">peso {d.points}</span>
              </div>
            )
          })}
        </div>
      )}
    </ChartCard>
  )
}

// ── Tabela de risco ────────────────────────────────────────────────────────────
function RiskTable({ cards, memberName }: { cards: Card[]; memberName: (id: string | null) => string }) {
  return (
    <ChartCard title="Cards que precisam de atenção" icon={AlertTriangle}
      action={<span className="text-[11px] text-paper-400">vencidos ou sem estimativa</span>}>
      {cards.length === 0 ? (
        <div className="flex h-24 items-center justify-center gap-2 text-sm text-paper-400">
          <CheckCircle2 className="size-4 text-success" /> Nenhum card em risco. Bom trabalho!
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-paper-200 text-left text-[11px] uppercase tracking-wide text-paper-400 dark:border-ink-700">
                <th className="py-2 pr-3 font-medium">Card</th>
                <th className="px-3 py-2 font-medium">Tipo</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Responsável</th>
                <th className="px-3 py-2 text-right font-medium">Pts</th>
                <th className="px-3 py-2 text-right font-medium">Prazo</th>
              </tr>
            </thead>
            <tbody>
              {cards.map((c) => {
                const overdue = isOverdue(c)
                const noEst = c.points == null || c.points === 0
                return (
                  <tr key={c.id} className="border-b border-paper-100 last:border-0 dark:border-ink-800">
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] text-paper-400 tabular">{c.ref}</span>
                        <span className="truncate text-ink dark:text-paper">{c.title}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span className="rounded px-1.5 py-0.5 text-[11px] font-medium text-white" style={{ backgroundColor: TYPE_COLOR[c.type] }}>
                        {TYPE_LABEL[c.type]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-paper-500">{STATUS_LABEL[c.status]}</td>
                    <td className="px-3 py-2 text-xs text-paper-500">{memberName(c.assignee_id)}</td>
                    <td className="px-3 py-2 text-right">
                      {noEst
                        ? <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">sem est.</span>
                        : <span className="tabular text-ink dark:text-paper">{c.points}</span>}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {c.due_date
                        ? <span className={cx("tabular text-xs", overdue ? "font-semibold text-danger" : "text-paper-500")}>{fmtDay(c.due_date)}</span>
                        : <span className="text-xs text-paper-300">—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </ChartCard>
  )
}

// ── Legend inline ──────────────────────────────────────────────────────────────
function Legend({ items }: { items: { color: string; label: string; dashed?: boolean }[] }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-paper-500">
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1.5">
          {it.dashed
            ? <span className="inline-block h-0 w-5 border-t-2 border-dashed" style={{ borderColor: it.color }} />
            : <span className="inline-block size-2.5 rounded-sm" style={{ backgroundColor: it.color }} />}
          {it.label}
        </span>
      ))}
    </div>
  )
}

// ── Export CSV ───────────────────────────────────────────────────────────────
function exportCsv(cards: Card[], projectKey: string, memberName: (id: string | null) => string) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
  const header = ["Ref", "Título", "Tipo", "Status", "Prioridade", "Peso", "Responsável", "Prazo", "Criado em"]
  const rows = cards.map((c) => [
    c.ref, c.title, TYPE_LABEL[c.type], STATUS_LABEL[c.status], PRIORITY_LABEL[c.priority],
    c.points ?? "", memberName(c.assignee_id), c.due_date ?? "", c.created_at?.slice(0, 10) ?? "",
  ].map(esc).join(","))
  const csv = [header.map(esc).join(","), ...rows].join("\n")
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `relatorio-${projectKey}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
