import { LineChart, TrendingUp, Layers, BarChart2 } from "lucide-react"
import { useState } from "react"
import { useProjects, useProjectReports, useWorkspaces } from "@/features/workspace/workspace.hooks"
import type { ProjectReports } from "@/features/workspace/workspace.api"
import { PageHeader, Spinner, cx } from "@/shared/ui/primitives"

const STATUS_LABEL: Record<string, string> = {
  backlog: "Backlog", todo: "A fazer", doing: "Em andamento", review: "Em revisão", done: "Concluído",
}
const STATUS_COLOR: Record<string, string> = {
  backlog: "#a1a1ad", todo: "#d8d8e0", doing: "#6c5cf0", review: "#d97706", done: "#16a34a",
}

export function ReportsPage() {
  const { activeWorkspaceId } = useWorkspaces()
  const { data: projects } = useProjects(activeWorkspaceId)
  const [projectId, setProjectId] = useState<string | null>(null)
  const pid = projectId ?? projects?.[0]?.id ?? null
  const { data: reports, isLoading } = useProjectReports(pid)

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={<><LineChart className="size-4 text-brand-500" /><span>Relatórios</span></>}
        title="Relatórios Ágeis"
        subtitle="Burndown, velocidade e fluxo cumulativo do projeto."
      >
        {projects && projects.length > 1 && (
          <select
            value={pid ?? ""}
            onChange={(e) => setProjectId(e.target.value)}
            className="rounded-xl border border-paper-300 bg-paper dark:bg-ink-900 px-3 py-2 text-sm text-ink dark:text-paper outline-none focus:border-brand-400"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.key} — {p.name}</option>
            ))}
          </select>
        )}
      </PageHeader>

      {isLoading || !reports ? (
        <div className="flex justify-center py-20"><Spinner className="size-6" /></div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <BurndownChart data={reports.burndown} />
          <VelocityChart data={reports.velocity} />
          <CFDChart data={reports.cfd} />
          <SummaryCards data={reports} />
        </div>
      )}
    </div>
  )
}

// ─── Burndown ─────────────────────────────────────────────────────────────────

function BurndownChart({ data }: { data: ProjectReports["burndown"] }) {
  const W = 440, H = 200, PAD = { t: 16, r: 16, b: 32, l: 40 }
  const iW = W - PAD.l - PAD.r
  const iH = H - PAD.t - PAD.b

  if (!data.sprint || data.ideal.length === 0) {
    return (
      <ChartCard title="Burndown" icon={<LineChart className="size-4" />}>
        <div className="flex h-[200px] items-center justify-center text-sm text-paper-400">
          Nenhuma sprint ativa ou encerrada com datas.
        </div>
      </ChartCard>
    )
  }

  const maxPts = data.sprint.total_points || 1
  const n = data.ideal.length

  function px(i: number) { return PAD.l + (i / Math.max(n - 1, 1)) * iW }
  function py(v: number) { return PAD.t + (1 - v / maxPts) * iH }

  const idealPath = data.ideal.map((d, i) => `${i === 0 ? "M" : "L"}${px(i)},${py(d.points)}`).join(" ")
  const actualPath = data.actual.map((d, i) => `${i === 0 ? "M" : "L"}${px(i)},${py(d.points)}`).join(" ")

  return (
    <ChartCard title={`Burndown — ${data.sprint.name}`} icon={<LineChart className="size-4" />}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {/* Y grid */}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={PAD.l} x2={W - PAD.r} y1={PAD.t + f * iH} y2={PAD.t + f * iH} stroke="#e9e9ee" strokeWidth={1} />
            <text x={PAD.l - 4} y={PAD.t + f * iH + 4} textAnchor="end" fontSize={9} fill="#a1a1ad">
              {Math.round(maxPts * (1 - f))}
            </text>
          </g>
        ))}
        {/* Ideal line */}
        <path d={idealPath} fill="none" stroke="#d8d8e0" strokeWidth={1.5} strokeDasharray="4 3" />
        {/* Actual line */}
        <path d={actualPath} fill="none" stroke="#6c5cf0" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        {/* Dots on actual */}
        {data.actual.map((d, i) => (
          <circle key={i} cx={px(i)} cy={py(d.points)} r={3} fill="#6c5cf0" />
        ))}
        {/* X labels (first + last + today) */}
        <text x={PAD.l} y={H - 6} fontSize={9} fill="#a1a1ad">{data.ideal[0]?.date.slice(5)}</text>
        <text x={W - PAD.r} y={H - 6} fontSize={9} fill="#a1a1ad" textAnchor="end">{data.ideal[n - 1]?.date.slice(5)}</text>
      </svg>
      <div className="mt-1 flex items-center gap-4 text-xs text-paper-500">
        <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-5 border-t-2 border-dashed border-paper-300" />Ideal</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-5 bg-brand-500 rounded" />Real</span>
      </div>
    </ChartCard>
  )
}

// ─── Velocity ────────────────────────────────────────────────────────────────

function VelocityChart({ data }: { data: { sprint: string; committed: number; delivered: number }[] }) {
  const W = 440, H = 200, PAD = { t: 16, r: 16, b: 40, l: 40 }
  const iW = W - PAD.l - PAD.r
  const iH = H - PAD.t - PAD.b

  if (data.length === 0) return (
    <ChartCard title="Velocidade" icon={<TrendingUp className="size-4" />}>
      <div className="flex h-[200px] items-center justify-center text-sm text-paper-400">Nenhuma sprint encerrada.</div>
    </ChartCard>
  )

  const maxV = Math.max(...data.map((d) => Math.max(d.committed, d.delivered)), 1)
  const n = data.length
  const barW = Math.max(8, (iW / n) * 0.35)
  const avg = Math.round(data.reduce((s, d) => s + d.delivered, 0) / n)

  return (
    <ChartCard title="Velocidade" icon={<TrendingUp className="size-4" />}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={PAD.l} x2={W - PAD.r} y1={PAD.t + f * iH} y2={PAD.t + f * iH} stroke="#e9e9ee" strokeWidth={1} />
            <text x={PAD.l - 4} y={PAD.t + f * iH + 4} textAnchor="end" fontSize={9} fill="#a1a1ad">
              {Math.round(maxV * (1 - f))}
            </text>
          </g>
        ))}
        {/* Avg line */}
        <line x1={PAD.l} x2={W - PAD.r} y1={PAD.t + (1 - avg / maxV) * iH} y2={PAD.t + (1 - avg / maxV) * iH}
          stroke="#6c5cf0" strokeWidth={1} strokeDasharray="4 2" />
        {data.map((d, i) => {
          const x = PAD.l + (i + 0.5) * (iW / n)
          const hC = (d.committed / maxV) * iH
          const hD = (d.delivered / maxV) * iH
          return (
            <g key={i}>
              <rect x={x - barW - 1} y={PAD.t + iH - hC} width={barW} height={hC} fill="#e9e9ee" rx={2} />
              <rect x={x + 1} y={PAD.t + iH - hD} width={barW} height={hD} fill="#6c5cf0" rx={2} />
              <text x={x} y={H - 8} textAnchor="middle" fontSize={8} fill="#a1a1ad">{d.sprint.replace(/sprint\s*/i, "S")}</text>
            </g>
          )
        })}
      </svg>
      <div className="mt-1 flex items-center gap-4 text-xs text-paper-500">
        <span className="flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-sm bg-paper-200 dark:bg-ink-700" />Comprometido</span>
        <span className="flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-sm bg-brand-500" />Entregue</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-4 border-t border-dashed border-brand-400" />Média ({avg})</span>
      </div>
    </ChartCard>
  )
}

// ─── CFD ──────────────────────────────────────────────────────────────────────

function CFDChart({ data }: { data: { status: string; count: number }[] }) {
  const total = data.reduce((s, d) => s + d.count, 0) || 1

  return (
    <ChartCard title="Fluxo Cumulativo (snapshot)" icon={<Layers className="size-4" />}>
      <div className="space-y-2.5 py-2">
        {data.map((d) => {
          const pct = Math.round((d.count / total) * 100)
          return (
            <div key={d.status} className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-right text-[11px] text-paper-500">{STATUS_LABEL[d.status]}</span>
              <div className="flex-1 overflow-hidden rounded-full bg-paper-100 dark:bg-ink-800 h-4">
                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: STATUS_COLOR[d.status] }} />
              </div>
              <span className="w-10 text-right text-[11px] font-semibold text-ink dark:text-paper tabular">{d.count}</span>
              <span className="w-8 text-right text-[10px] text-paper-400 tabular">{pct}%</span>
            </div>
          )
        })}
      </div>
    </ChartCard>
  )
}

// ─── Summary ──────────────────────────────────────────────────────────────────

function SummaryCards({ data }: { data: ProjectReports }) {
  const avgVel = data.velocity.length
    ? Math.round(data.velocity.reduce((s, d) => s + d.delivered, 0) / data.velocity.length)
    : 0
  const totalCards = data.cfd.reduce((s, d) => s + d.count, 0)
  const done = data.cfd.find((d) => d.status === "done")?.count ?? 0
  const wip = (data.cfd.find((d) => d.status === "doing")?.count ?? 0) + (data.cfd.find((d) => d.status === "review")?.count ?? 0)

  const stats = [
    { label: "Velocidade média", value: avgVel, unit: "pts/sprint", color: "text-brand-600" },
    { label: "Cards totais", value: totalCards, unit: "cards", color: "text-ink dark:text-paper" },
    { label: "Concluídos", value: done, unit: `${totalCards ? Math.round((done / totalCards) * 100) : 0}%`, color: "text-success" },
    { label: "Em progresso", value: wip, unit: "cards", color: "text-warning" },
  ]

  return (
    <ChartCard title="Resumo" icon={<BarChart2 className="size-4" />}>
      <div className="grid grid-cols-2 gap-3 py-2">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl bg-paper-50 dark:bg-ink-900 p-3">
            <p className="text-[11px] text-paper-500">{s.label}</p>
            <p className={cx("mt-0.5 text-2xl font-bold tabular", s.color)}>{s.value}</p>
            <p className="text-[10px] text-paper-400">{s.unit}</p>
          </div>
        ))}
      </div>
    </ChartCard>
  )
}

// ─── ChartCard wrapper ────────────────────────────────────────────────────────

function ChartCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-900 p-5 shadow-card">
      <div className="mb-3 flex items-center gap-2 text-paper-500">
        {icon}
        <span className="text-sm font-semibold text-ink dark:text-paper">{title}</span>
      </div>
      {children}
    </div>
  )
}
