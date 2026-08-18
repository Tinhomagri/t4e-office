import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Flag,
  Layers,
  ListChecks,
  Loader2,
  PieChart,
  Tags,
  TrendingUp,
  Users,
} from "lucide-react"
import { useEffect, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"

import {
  ColoredAvatar,
  PRIORITY_BAR,
  PRIORITY_LABEL,
  TYPE_COLOR,
  TYPE_LABEL,
} from "@/features/boards/board.shared"
import {
  useMembers,
  useProjects,
  useWorkflowStatuses,
  useWorkspaceCards,
  useWorkspaces,
  type BoardCard,
} from "@/features/workspace/workspace.hooks"
import type { CardPriority, CardType } from "@/features/workspace/workspace.types"
import { Badge, cx } from "@/shared/ui/primitives"
import { BRAND, MiniDonut, SectionHeader, ThroughputArea, WorkloadBars, weeklyThroughput } from "./charts"
import { HEALTH_LABEL, HEALTH_TONE, computeHealth } from "./portfolio.shared"

export function ProjectPortfolioPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const { activeWorkspaceId } = useWorkspaces()
  const { projects, cards, isLoading } = useWorkspaceCards(activeWorkspaceId)
  const { data: members } = useMembers(activeWorkspaceId)
  const { data: statuses } = useWorkflowStatuses(projectId ?? null)
  useProjects(activeWorkspaceId) // mantém cache aquecido p/ navegação entre projetos

  const PAGE_SIZE = 20
  const [page, setPage] = useState(1)
  useEffect(() => setPage(1), [projectId])

  if (isLoading) {
    return (
      <div className="grid place-items-center py-24">
        <Loader2 className="size-6 animate-spin text-paper-400" />
      </div>
    )
  }

  const project = projects.find((p) => p.id === projectId)
  if (!project) {
    return (
      <div className="surface p-10 text-center">
        <p className="text-sm font-medium text-ink dark:text-paper">Projeto não encontrado.</p>
        <button
          onClick={() => navigate("/app/portfolio")}
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand-500 hover:text-brand-600"
        >
          <ArrowLeft className="size-4" />
          Voltar ao portfólio
        </button>
      </div>
    )
  }

  const row = computeHealth(project, cards.filter((c) => c.project_id === project.id))
  const pct = Math.round(row.progress * 100)
  const memberName = (id: string | null) => members?.find((m) => m.user_id === id)?.name ?? null

  // Colunas reais do projeto — a lista fixa de 5 status não bate com workflows
  // customizados (ex.: importados do Jira), o que zerava esta distribuição.
  const statusMeta = new Map((statuses ?? []).map((s) => [s.slug, s]))
  const statusBreakdown = (statuses ?? []).map((s) => ({
    slug: s.slug, label: s.name, color: s.color,
    count: row.cards.filter((c) => c.status === s.slug).length,
  }))

  const openCards = row.cards
    .filter((c) => c.resolution !== "done")
    .sort((a, b) => (b.points ?? 0) - (a.points ?? 0))
  const totalPages = Math.max(1, Math.ceil(openCards.length / PAGE_SIZE))
  const pageClamped = Math.min(page, totalPages)

  const priorityCounts = (["urgent", "high", "medium", "low"] as CardPriority[]).map((p) => ({
    priority: p,
    count: row.cards.filter((c) => c.priority === p).length,
  }))
  const typeCounts = (["feature", "bug", "debt", "spike", "chore", "epic"] as CardType[])
    .map((t) => ({ type: t, count: row.cards.filter((c) => c.type === t).length }))
    .filter((t) => t.count > 0)

  // Carga por responsável — quem está segurando o projeto, por peso entregue.
  const assigneeMap = new Map<string, { count: number; points: number }>()
  for (const c of row.cards) {
    const k = c.assignee_id ?? "__none__"
    const cur = assigneeMap.get(k) ?? { count: 0, points: 0 }
    cur.count += 1
    cur.points += c.points ?? 0
    assigneeMap.set(k, cur)
  }
  const workloadRows = [...assigneeMap.entries()]
    .map(([id, v]) => ({
      key: id,
      label: id === "__none__" ? "Não atribuído" : memberName(id) ?? "—",
      value: v.points,
      color: BRAND,
      sub: `· ${v.count} cards`,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8)

  const throughput = weeklyThroughput(row.cards)

  return (
    <div className="space-y-6 pb-10">
      <Link
        to="/app/portfolio"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-paper-500 hover:text-ink dark:hover:text-paper"
      >
        <ArrowLeft className="size-4" />
        Portfólio
      </Link>

      {/* Hero */}
      <div className="surface relative overflow-hidden p-6 sm:p-8">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,theme(colors.brand.500/14%),transparent_55%)]"
        />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-ink-600 to-ink-900 text-xl font-bold text-paper shadow-brand-glow">
              {project.key.slice(0, 2)}
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold text-ink dark:text-paper">{project.name}</h1>
                <Badge tone={HEALTH_TONE[row.health]}>{HEALTH_LABEL[row.health]}</Badge>
              </div>
              <p className="mt-1 font-mono text-xs text-paper-400">{project.key}</p>
            </div>
          </div>

          <ProgressRing pct={pct} health={row.health} />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={Layers} label="Total de cards" value={row.total} />
        <StatCard icon={CheckCircle2} label="Concluídos" value={row.done} tone="success" />
        <StatCard icon={TrendingUp} label="Peso (feito/total)" value={`${row.pointsDone}/${row.pointsTotal}`} />
        <StatCard
          icon={AlertTriangle}
          label="Em revisão"
          value={row.reviewAging}
          tone={row.reviewAging >= 3 ? "danger" : undefined}
        />
      </div>

      {row.reviewAging >= 3 && (
        <p className="surface flex items-center gap-2 border-warning/30 bg-warning/5 px-4 py-3 text-sm text-warning">
          <AlertTriangle className="size-4 shrink-0" />
          Gargalo detectado: {row.reviewAging} cards parados em revisão.
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          {/* Status distribution */}
          <section className="surface p-5">
            <SectionHeader icon={PieChart} title="Distribuição por status" />
            <div className="flex items-center gap-8 max-w-md">
              <MiniDonut
                size={148}
                rows={statusBreakdown.map((s) => ({ label: s.label, color: s.color, count: s.count }))}
                total={row.total}
                centerLabel="cards"
              />
              <ul className="min-w-0 flex-1 space-y-2">
                {statusBreakdown.filter((s) => s.count > 0).map((s) => (
                  <li key={s.slug} className="flex items-center gap-2 text-xs">
                    <span className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: s.color }} />
                    <span className="min-w-0 flex-1 truncate text-paper-500">{s.label}</span>
                    <span className="shrink-0 font-semibold tabular text-ink dark:text-paper">{s.count}</span>
                    <span className="w-9 shrink-0 text-right text-[10px] text-paper-400 tabular">
                      {row.total > 0 ? Math.round((s.count / row.total) * 100) : 0}%
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* Vazão semanal */}
          <section className="surface p-5">
            <SectionHeader icon={TrendingUp} title="Vazão semanal" sub="últimas 8 semanas" />
            <ThroughputArea data={throughput} />
            <div className="mt-2 flex items-center gap-4 text-[11px] text-paper-500">
              <span className="flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-sm" style={{ backgroundColor: "#9F8FEF" }} /> Criados</span>
              <span className="flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-sm" style={{ backgroundColor: "#1F845A" }} /> Concluídos</span>
            </div>
          </section>

          {/* Open cards list */}
          <section className="surface p-5">
            <SectionHeader icon={ListChecks} title={`Em aberto (${openCards.length})`} />
            {openCards.length === 0 ? (
              <p className="mt-3 text-sm text-paper-400">Nenhum card em aberto. 🎉</p>
            ) : (
              <ul className="mt-3 divide-y divide-paper-100 dark:divide-ink-800">
                {openCards.slice((pageClamped - 1) * PAGE_SIZE, pageClamped * PAGE_SIZE).map((c: BoardCard) => (
                  <li key={c.id} className="flex items-center gap-3 py-2.5">
                    <span className={cx("h-6 w-1 shrink-0 rounded-full", PRIORITY_BAR[c.priority])} />
                    <span className="min-w-0 flex-1">
                      <p className="truncate text-sm text-ink dark:text-paper">{c.title}</p>
                      <p className="mt-0.5 flex items-center gap-2 text-[11px] text-paper-400">
                        <span className="font-mono">{c.ref}</span>
                        <span className={cx("rounded px-1.5 py-0.5 font-medium", TYPE_COLOR[c.type])}>
                          {TYPE_LABEL[c.type]}
                        </span>
                        <span className="flex items-center gap-1">
                          <span
                            className="size-1.5 rounded-full"
                            style={{ backgroundColor: statusMeta.get(c.status)?.color ?? "#8590A2" }}
                          />
                          {statusMeta.get(c.status)?.name ?? c.status}
                        </span>
                      </p>
                    </span>
                    {c.points != null && (
                      <span className="shrink-0 font-mono text-xs text-paper-400">{c.points}pt</span>
                    )}
                    {memberName(c.assignee_id) && (
                      <ColoredAvatar name={memberName(c.assignee_id)!} userId={c.assignee_id} size="sm" />
                    )}
                  </li>
                ))}
              </ul>
            )}
            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between border-t border-paper-100 pt-3 dark:border-ink-800">
                <p className="text-xs text-paper-400">
                  Página <span className="font-medium text-ink dark:text-paper tabular">{pageClamped}</span> de{" "}
                  <span className="tabular">{totalPages}</span>
                </p>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={pageClamped === 1}
                    className="grid size-7 place-items-center rounded-lg border border-paper-200 bg-paper text-paper-500 transition-colors hover:bg-paper-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-ink-700 dark:bg-ink-900 dark:hover:bg-ink-800"
                  >
                    <ChevronLeft className="size-4" />
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={pageClamped === totalPages}
                    className="grid size-7 place-items-center rounded-lg border border-paper-200 bg-paper text-paper-500 transition-colors hover:bg-paper-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-ink-700 dark:bg-ink-900 dark:hover:bg-ink-800"
                  >
                    <ChevronRight className="size-4" />
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>

        <div className="space-y-6">
          {/* Carga da equipe */}
          <section className="surface p-5">
            <SectionHeader icon={Users} title="Carga da equipe" sub="peso por pessoa" />
            <WorkloadBars rows={workloadRows} />
          </section>

          {/* Priority breakdown */}
          <section className="surface p-5">
            <SectionHeader icon={Flag} title="Por prioridade" />
            <div className="space-y-3">
              {priorityCounts.map(({ priority, count }) => (
                <div key={priority}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-paper-500">{PRIORITY_LABEL[priority]}</span>
                    <span className="font-medium text-ink dark:text-paper tabular">{count}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-paper-100 dark:bg-ink-800">
                    <div
                      className={cx("h-full rounded-full", PRIORITY_BAR[priority])}
                      style={{ width: row.total > 0 ? `${(count / row.total) * 100}%` : "0%" }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Type breakdown */}
          {typeCounts.length > 0 && (
            <section className="surface p-5">
              <SectionHeader icon={Tags} title="Por tipo" />
              <div className="flex flex-wrap gap-2">
                {typeCounts.map(({ type, count }) => (
                  <span
                    key={type}
                    className={cx("rounded-full px-3 py-1 text-xs font-medium", TYPE_COLOR[type])}
                  >
                    {TYPE_LABEL[type]} · {count}
                  </span>
                ))}
              </div>
            </section>
          )}

          <Link
            to={`/app/boards?project=${project.id}&view=quadro`}
            className="surface flex items-center justify-center gap-2 p-4 text-sm font-medium text-brand-500 transition-colors hover:bg-paper-50 dark:hover:bg-ink-800 hover:text-brand-600"
          >
            Abrir quadro completo
            <ExternalLink className="size-4" />
          </Link>
        </div>
      </div>
    </div>
  )
}

function ProgressRing({ pct, health }: { pct: number; health: "on-track" | "at-risk" | "off-track" }) {
  const r = 34
  const c = 2 * Math.PI * r
  const offset = c - (pct / 100) * c
  const stroke =
    health === "on-track"
      ? "stroke-success"
      : health === "at-risk"
        ? "stroke-warning"
        : "stroke-danger"
  return (
    <div className="relative grid size-24 shrink-0 place-items-center">
      <svg viewBox="0 0 80 80" className="size-24 -rotate-90">
        <circle cx="40" cy="40" r={r} className="fill-none stroke-paper-100 dark:stroke-ink-800" strokeWidth="8" />
        <circle
          cx="40"
          cy="40"
          r={r}
          className={cx("fill-none transition-all duration-700", stroke)}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <span className="absolute text-lg font-bold text-ink dark:text-paper tabular">{pct}%</span>
    </div>
  )
}

const STAT_TONE = {
  default: "bg-ink-500/10 text-ink dark:text-paper",
  success: "bg-success/10 text-success",
  danger: "bg-danger/10 text-danger",
} as const

function StatCard({
  icon: Icon,
  label,
  value,
  tone = "default",
}: {
  icon: typeof Layers
  label: string
  value: number | string
  tone?: keyof typeof STAT_TONE
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
