import { Building2, Loader2 } from "lucide-react"
import { Link } from "react-router-dom"

import {
  useWorkspaceCards,
  useWorkspaces,
  type BoardCard,
} from "@/features/workspace/workspace.hooks"
import type { Project } from "@/features/workspace/workspace.types"
import { Badge, PageHeader, cx } from "@/shared/ui/primitives"

type Health = "on-track" | "at-risk" | "off-track"

interface ProjectHealth {
  project: Project
  total: number
  done: number
  pointsTotal: number
  pointsDone: number
  reviewAging: number // cards parados em revisão
  progress: number // 0..1 por pontos (cai p/ contagem se não houver pontos)
  health: Health
}

const HEALTH_LABEL: Record<Health, string> = {
  "on-track": "No prazo",
  "at-risk": "Em risco",
  "off-track": "Atrasado",
}
const HEALTH_TONE: Record<Health, "success" | "warning" | "danger"> = {
  "on-track": "success",
  "at-risk": "warning",
  "off-track": "danger",
}
const HEALTH_BAR: Record<Health, string> = {
  "on-track": "bg-success",
  "at-risk": "bg-warning",
  "off-track": "bg-danger",
}

function computeHealth(project: Project, cards: BoardCard[]): ProjectHealth {
  const total = cards.length
  const done = cards.filter((c) => c.status === "done").length
  const pointsTotal = cards.reduce((s, c) => s + (c.points ?? 0), 0)
  const pointsDone = cards
    .filter((c) => c.status === "done")
    .reduce((s, c) => s + (c.points ?? 0), 0)
  const reviewAging = cards.filter((c) => c.status === "review").length
  const progress = pointsTotal > 0 ? pointsDone / pointsTotal : total > 0 ? done / total : 0

  // Heurística de saúde a partir de dados reais (sem velocity histórica ainda).
  let health: Health = "on-track"
  if (total === 0) health = "on-track"
  else if (reviewAging >= 3 || progress < 0.3) health = "off-track"
  else if (reviewAging >= 1 || progress < 0.6) health = "at-risk"

  return { project, total, done, pointsTotal, pointsDone, reviewAging, progress, health }
}

export function PortfolioPage() {
  const { activeWorkspaceId } = useWorkspaces()
  const { projects, cards, isLoading } = useWorkspaceCards(activeWorkspaceId)

  const rows = projects.map((p) =>
    computeHealth(p, cards.filter((c) => c.project_id === p.id)),
  )
  const atRisk = rows.filter((r) => r.health !== "on-track").length

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <>
            <Building2 className="size-4 text-brand-500" />
            <span>Portfólio</span>
          </>
        }
        title="Saúde dos projetos"
        subtitle="Visão de alto nível calculada a partir dos cards reais de cada projeto."
      />

      {isLoading ? (
        <div className="grid place-items-center py-20">
          <Loader2 className="size-6 animate-spin text-paper-400" />
        </div>
      ) : rows.length === 0 ? (
        <Empty />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Projetos" value={rows.length} />
            <Stat label="Em risco / atrasados" value={atRisk} />
            <Stat label="Cards no portfólio" value={cards.length} />
            <Stat
              label="Pontos concluídos"
              value={rows.reduce((s, r) => s + r.pointsDone, 0)}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
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
      to="/app/boards"
      className="surface group block p-5 transition-shadow hover:shadow-panel"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-ink-600 to-ink-900 text-[11px] font-bold text-paper">
              {row.project.key.slice(0, 2)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{row.project.name}</p>
              <p className="font-mono text-[11px] text-paper-400">{row.project.key}</p>
            </div>
          </div>
        </div>
        <Badge tone={HEALTH_TONE[row.health]}>{HEALTH_LABEL[row.health]}</Badge>
      </div>

      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="text-paper-500">Progresso (pontos)</span>
          <span className="font-medium text-ink tabular">{pct}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-paper-100">
          <div
            className={cx("h-full rounded-full transition-all", HEALTH_BAR[row.health])}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <Mini label="Cards" value={row.total} />
        <Mini label="Concluídos" value={row.done} />
        <Mini label="Em revisão" value={row.reviewAging} warn={row.reviewAging >= 3} />
      </div>

      {row.reviewAging >= 3 && (
        <p className="mt-3 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
          Gargalo: {row.reviewAging} cards parados em revisão.
        </p>
      )}
    </Link>
  )
}

function Mini({ label, value, warn = false }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="rounded-lg bg-paper-50 py-2">
      <p className={cx("text-lg font-bold tabular", warn ? "text-warning" : "text-ink")}>{value}</p>
      <p className="text-[11px] text-paper-500">{label}</p>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="surface p-4">
      <p className="text-[26px] font-bold leading-none text-ink tabular">{value}</p>
      <p className="mt-2 text-[13px] font-medium text-ink">{label}</p>
    </div>
  )
}

function Empty() {
  return (
    <div className="surface p-10 text-center">
      <p className="text-sm font-medium text-ink">Nenhum projeto no workspace.</p>
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
