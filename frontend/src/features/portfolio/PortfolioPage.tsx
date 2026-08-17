import { AlertTriangle, Building2, CheckCircle2, Layers, Loader2, Sparkles, Target, Users } from "lucide-react"
import { useState } from "react"
import { Link } from "react-router-dom"

import { useMembers, useWorkspaceCards, useWorkspaces } from "@/features/workspace/workspace.hooks"
import { TabBar, type TabDef } from "@/features/workspace/members/shared"
import { Badge, PageHeader, cx } from "@/shared/ui/primitives"
import { MembersPortfolioTab } from "./MembersPortfolioTab"
import {
  HEALTH_BAR,
  HEALTH_LABEL,
  HEALTH_RANK,
  HEALTH_RING,
  HEALTH_TONE,
  computeHealth,
  type ProjectHealth,
} from "./portfolio.shared"

type PortfolioTab = "projects" | "members"
const TABS: TabDef<PortfolioTab>[] = [
  { id: "projects", label: "Projetos", icon: <Building2 className="size-4" /> },
  { id: "members", label: "Integrantes", icon: <Users className="size-4" /> },
]

export function PortfolioPage() {
  const [tab, setTab] = useState<PortfolioTab>("projects")
  const { activeWorkspaceId } = useWorkspaces()
  const { projects, cards, isLoading } = useWorkspaceCards(activeWorkspaceId)
  const { data: members } = useMembers(activeWorkspaceId)

  const rows = projects
    .map((p) => computeHealth(p, cards.filter((c) => c.project_id === p.id)))
    .sort((a, b) => HEALTH_RANK[a.health] - HEALTH_RANK[b.health] || b.total - a.total)
  const atRisk = rows.filter((r) => r.health !== "on-track").length
  const pointsDone = rows.reduce((s, r) => s + r.pointsDone, 0)
  const pointsTotal = rows.reduce((s, r) => s + r.pointsTotal, 0)
  const overallPct = pointsTotal > 0 ? Math.round((pointsDone / pointsTotal) * 100) : 0

  return (
    <div className="space-y-6">
      <div className="surface relative overflow-hidden p-6">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,theme(colors.brand.500/12%),transparent_60%)]"
        />
        <PageHeader
          eyebrow={
            <>
              <Building2 className="size-4 text-brand-500" />
              <span>Portfólio</span>
            </>
          }
          title={tab === "projects" ? "Saúde dos projetos" : "Carga por integrante"}
          subtitle={
            tab === "projects"
              ? "Visão de alto nível calculada a partir dos cards reais de cada projeto."
              : "Cards, progresso e projetos de cada pessoa no workspace."
          }
        />
      </div>

      <TabBar tabs={TABS} active={tab} onChange={setTab} />

      {isLoading ? (
        <div className="grid place-items-center py-20">
          <Loader2 className="size-6 animate-spin text-paper-400" />
        </div>
      ) : tab === "members" ? (
        <MembersPortfolioTab members={members ?? []} cards={cards} />
      ) : rows.length === 0 ? (
        <Empty />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat icon={Layers} tone="brand" label="Projetos" value={rows.length} />
            <Stat
              icon={AlertTriangle}
              tone="warning"
              label="Em risco / atrasados"
              value={atRisk}
            />
            <Stat icon={Sparkles} tone="ink" label="Cards no portfólio" value={cards.length} />
            <Stat icon={Target} tone="success" label="Progresso geral" value={`${overallPct}%`} />
          </div>

          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink dark:text-paper">
              Projetos ({rows.length})
            </h2>
            {atRisk > 0 && (
              <span className="flex items-center gap-1.5 text-xs font-medium text-warning">
                <AlertTriangle className="size-3.5" />
                {atRisk} precisam de atenção
              </span>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {rows.map((r) => (
              <ProjectCard key={r.project.id} row={r} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function ProjectCard({ row }: { row: ProjectHealth }) {
  const pct = Math.round(row.progress * 100)
  return (
    <Link
      to={`/app/portfolio/${row.project.id}`}
      className={cx(
        "surface group relative block overflow-hidden p-5 ring-1 ring-transparent transition-all hover:-translate-y-0.5 hover:shadow-panel",
        HEALTH_RING[row.health],
      )}
    >
      <div
        aria-hidden
        className={cx("absolute inset-x-0 top-0 h-1", HEALTH_BAR[row.health])}
      />

      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-ink-600 to-ink-900 text-xs font-bold text-paper shadow-sm">
            {row.project.key.slice(0, 2)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink dark:text-paper">
              {row.project.name}
            </p>
            <p className="font-mono text-[11px] text-paper-400">{row.project.key}</p>
          </div>
        </div>
        <Badge tone={HEALTH_TONE[row.health]}>{HEALTH_LABEL[row.health]}</Badge>
      </div>

      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="text-paper-500">Progresso (peso)</span>
          <span className="font-medium text-ink dark:text-paper tabular">{pct}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-paper-100 dark:bg-ink-800">
          <div
            className={cx("h-full rounded-full transition-all", HEALTH_BAR[row.health])}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <Mini label="Cards" value={row.total} />
        <Mini label="Concluídos" value={row.done} icon={CheckCircle2} />
        <Mini label="Em revisão" value={row.reviewAging} warn={row.reviewAging >= 3} />
      </div>

      {row.reviewAging >= 3 && (
        <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
          <AlertTriangle className="size-3.5 shrink-0" />
          Gargalo: {row.reviewAging} cards parados em revisão.
        </p>
      )}
    </Link>
  )
}

function Mini({
  label,
  value,
  warn = false,
  icon: Icon,
}: {
  label: string
  value: number
  warn?: boolean
  icon?: typeof CheckCircle2
}) {
  return (
    <div className="rounded-lg bg-paper-50 dark:bg-ink-900 py-2">
      <p
        className={cx(
          "flex items-center justify-center gap-1 text-lg font-bold tabular",
          warn ? "text-warning" : "text-ink dark:text-paper",
        )}
      >
        {Icon && <Icon className="size-3.5" />}
        {value}
      </p>
      <p className="text-[11px] text-paper-500">{label}</p>
    </div>
  )
}

const STAT_TONE = {
  brand: "bg-brand-500/10 text-brand-500",
  warning: "bg-warning/10 text-warning",
  success: "bg-success/10 text-success",
  ink: "bg-ink-500/10 text-ink dark:text-paper",
} as const

function Stat({
  icon: Icon,
  tone,
  label,
  value,
}: {
  icon: typeof Layers
  tone: keyof typeof STAT_TONE
  label: string
  value: number | string
}) {
  return (
    <div className="surface flex items-center gap-3 p-4">
      <span className={cx("grid size-9 shrink-0 place-items-center rounded-lg", STAT_TONE[tone])}>
        <Icon className="size-4.5" />
      </span>
      <div className="min-w-0">
        <p className="text-[22px] font-bold leading-none text-ink dark:text-paper tabular">{value}</p>
        <p className="mt-1 truncate text-[12px] font-medium text-paper-500">{label}</p>
      </div>
    </div>
  )
}

function Empty() {
  return (
    <div className="surface p-10 text-center">
      <p className="text-sm font-medium text-ink dark:text-paper">Nenhum projeto no workspace.</p>
      <p className="mt-1 text-sm text-paper-500">
        Crie projetos nos boards para ver a saúde do portfólio aqui.
      </p>
      <Link
        to="/app/boards"
        className="mt-4 inline-flex rounded-xl bg-brand-500 px-4 py-2 text-sm font-medium text-white shadow-brand-glow hover:bg-brand-600"
      >
        Ir para os boards
      </Link>
    </div>
  )
}
