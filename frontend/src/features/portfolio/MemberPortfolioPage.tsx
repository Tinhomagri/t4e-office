import { useQueries } from "@tanstack/react-query"
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  Clock,
  ExternalLink,
  Flag,
  Gauge,
  Layers,
  ListChecks,
  Loader2,
  Mail,
  PieChart,
  Tags,
  TrendingUp,
  Zap,
} from "lucide-react"
import { useEffect, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"

import {
  PRIORITY_BAR,
  PRIORITY_LABEL,
  TYPE_COLOR,
  TYPE_LABEL,
  avatarGradient,
} from "@/features/boards/board.shared"
import {
  useMembers,
  useProjects,
  useWorkspaceCards,
  useWorkspaces,
  type BoardCard,
} from "@/features/workspace/workspace.hooks"
import * as wsApi from "@/features/workspace/workspace.api"
import type { CardPriority, CardType } from "@/features/workspace/workspace.types"
import { cx } from "@/shared/ui/primitives"
import { MiniDonut, SectionHeader, ThroughputArea, weeklyThroughput } from "./charts"

const PRIORITY_COLOR: Record<CardPriority, string> = {
  low: "#8590A2", medium: "#8270DB", high: "#E2B203", urgent: "#E2483D",
}
const TYPE_HEX: Record<CardType, string> = {
  feature: "#8270DB", bug: "#E2483D", debt: "#E56910", spike: "#2898BD", chore: "#8590A2", epic: "#CD519D",
  post: "#8270DB", peca: "#8590A2", campanha: "#CD519D", artigo: "#E56910", email: "#E2B203",
}
const CATEGORY_LABEL = { done: "Concluído", in_progress: "Em andamento", todo: "A fazer" } as const
const CATEGORY_COLOR = { done: "#1F845A", in_progress: "#8270DB", todo: "#8590A2" } as const

const PAGE_SIZE = 20

function isOverdue(c: BoardCard): boolean {
  if (!c.due_date || c.resolution === "done") return false
  const d = new Date(c.due_date + "T00:00:00")
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return d.getTime() < today.getTime()
}

function relativeDay(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  const diffDays = Math.round((Date.now() - d.getTime()) / 86_400_000)
  if (diffDays <= 0) return "hoje"
  if (diffDays === 1) return "ontem"
  if (diffDays < 7) return `${diffDays}d atrás`
  if (diffDays < 60) return `${Math.round(diffDays / 7)}sem atrás`
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`
}

export function MemberPortfolioPage() {
  const { userId } = useParams<{ userId: string }>()
  const navigate = useNavigate()
  const { activeWorkspaceId } = useWorkspaces()
  const { cards, isLoading } = useWorkspaceCards(activeWorkspaceId)
  const { data: members } = useMembers(activeWorkspaceId)
  useProjects(activeWorkspaceId) // mantém cache aquecido p/ navegação entre pessoas/projetos

  const [openPage, setOpenPage] = useState(1)
  useEffect(() => setOpenPage(1), [userId])

  const mine = cards.filter((c) => c.assignee_id === userId)

  // Status reais só existem por projeto — busca as colunas de cada projeto em
  // que a pessoa tem cards, pra rotular o status do card sem cair no slug cru.
  const involvedProjectIds = [...new Set(mine.map((c) => c.project_id))]
  const statusQueries = useQueries({
    queries: involvedProjectIds.map((pid) => ({
      queryKey: ["workflow-statuses", pid],
      queryFn: () => wsApi.listWorkflowStatuses(pid),
      enabled: involvedProjectIds.length > 0,
    })),
  })
  const statusMeta = new Map<string, { name: string; color: string; category: string }>()
  involvedProjectIds.forEach((pid, i) => {
    for (const s of statusQueries[i]?.data ?? []) {
      statusMeta.set(`${pid}:${s.slug}`, { name: s.name, color: s.color, category: s.category })
    }
  })

  if (isLoading) {
    return (
      <div className="grid place-items-center py-24">
        <Loader2 className="size-6 animate-spin text-paper-400" />
      </div>
    )
  }

  const member = members?.find((m) => m.user_id === userId)
  if (!member) {
    return (
      <div className="surface p-10 text-center">
        <p className="text-sm font-medium text-ink dark:text-paper">Integrante não encontrado.</p>
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

  const total = mine.length
  const done = mine.filter((c) => c.resolution === "done").length
  const donePct = total ? Math.round((done / total) * 100) : 0
  const pointsTotal = mine.reduce((s, c) => s + (c.points ?? 0), 0)
  const pointsDone = mine.filter((c) => c.resolution === "done").reduce((s, c) => s + (c.points ?? 0), 0)
  const overdue = mine.filter(isOverdue)

  // Carga por projeto — a coluna vertebral do relatório: onde a pessoa atua e
  // com que peso em cada lugar.
  const projMap = new Map<string, { id: string; key: string; name: string; total: number; done: number; pointsTotal: number; pointsDone: number }>()
  for (const c of mine) {
    const cur = projMap.get(c.project_id) ?? {
      id: c.project_id, key: c.projectKey, name: c.projectName,
      total: 0, done: 0, pointsTotal: 0, pointsDone: 0,
    }
    cur.total += 1
    cur.pointsTotal += c.points ?? 0
    if (c.resolution === "done") {
      cur.done += 1
      cur.pointsDone += c.points ?? 0
    }
    projMap.set(c.project_id, cur)
  }
  const projectRows = [...projMap.values()].sort((a, b) => b.pointsTotal - a.pointsTotal || b.total - a.total)

  const priorityCounts = (["urgent", "high", "medium", "low"] as CardPriority[])
    .map((p) => ({ priority: p, count: mine.filter((c) => c.priority === p).length }))
  const typeCounts = (Object.keys(TYPE_LABEL) as CardType[])
    .map((t) => ({ type: t, count: mine.filter((c) => c.type === t).length }))
    .filter((t) => t.count > 0)
  const throughput = weeklyThroughput(mine)

  // Distribuição por categoria de status (concluído/em andamento/a fazer) —
  // a única forma de agregar status entre projetos com workflows diferentes,
  // já que a categoria é o único vocabulário comum entre eles.
  const categoryOf = (c: BoardCard) =>
    c.resolution === "done" ? "done" : statusMeta.get(`${c.project_id}:${c.status}`)?.category ?? "todo"
  const categoryCounts = (["done", "in_progress", "todo"] as const).map((cat) => ({
    key: cat, label: CATEGORY_LABEL[cat], color: CATEGORY_COLOR[cat],
    count: mine.filter((c) => categoryOf(c) === cat).length,
  }))

  // Tempo médio de resolução — quantos dias, em média, do card criado até
  // entregue. Métrica clássica de relatório de desempenho que faltava.
  const resolvedCards = mine.filter((c) => c.resolution === "done" && c.created_at && (c.resolved_at ?? c.updated_at))
  const avgCycleDays = resolvedCards.length
    ? Math.round(
        resolvedCards.reduce((s, c) => {
          const start = new Date(c.created_at!).getTime()
          const end = new Date((c.resolved_at ?? c.updated_at)!).getTime()
          return s + Math.max(0, end - start) / 86_400_000
        }, 0) / resolvedCards.length,
      )
    : null

  const openCards = mine
    .filter((c) => c.resolution !== "done")
    .sort((a, b) => (b.points ?? 0) - (a.points ?? 0))
  const totalPages = Math.max(1, Math.ceil(openCards.length / PAGE_SIZE))
  const pageClamped = Math.min(openPage, totalPages)

  const recent = [...mine]
    .filter((c) => c.updated_at)
    .sort((a, b) => new Date(b.updated_at!).getTime() - new Date(a.updated_at!).getTime())
    .slice(0, 8)

  const grad = avatarGradient(member.name)
  const initials = member.name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("")

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
            {member.avatar_url ? (
              <img
                src={member.avatar_url}
                alt={member.name}
                className="size-16 shrink-0 rounded-2xl object-cover shadow-brand-glow"
              />
            ) : (
              <span
                className={cx(
                  "grid size-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-br text-xl font-bold text-white shadow-brand-glow",
                  grad,
                )}
              >
                {initials}
              </span>
            )}
            <div>
              <h1 className="text-2xl font-bold text-ink dark:text-paper">{member.name}</h1>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-paper-400">
                <Mail className="size-3.5" /> {member.email}
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-paper-400">
                <Building2 className="size-3.5" /> Em {projectRows.length} projeto{projectRows.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>

          <ProgressRing pct={donePct} />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <StatCard icon={Layers} label="Total de cards" value={total} />
        <StatCard icon={CheckCircle2} label="Concluídos" value={done} tone="success" />
        <StatCard icon={Zap} label="Peso (feito/total)" value={`${pointsDone}/${pointsTotal}`} />
        <StatCard icon={Building2} label="Projetos" value={projectRows.length} />
        <StatCard icon={Gauge} label="Tempo médio" value={avgCycleDays != null ? `${avgCycleDays}d` : "—"} />
        <StatCard
          icon={AlertTriangle}
          label="Atrasados"
          value={overdue.length}
          tone={overdue.length > 0 ? "danger" : undefined}
        />
      </div>

      {/* Faixa de dashboard — 3 donuts lado a lado */}
      <div className="grid gap-5 sm:grid-cols-3">
        <section className="surface p-5">
          <SectionHeader icon={PieChart} title="Por status" />
          <div className="flex items-center gap-4">
            <MiniDonut size={112} total={total} centerLabel="cards" rows={categoryCounts} />
            <ul className="min-w-0 flex-1 space-y-1.5">
              {categoryCounts.filter((c) => c.count > 0).map((c) => (
                <li key={c.key} className="flex items-center gap-2 text-xs">
                  <span className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: c.color }} />
                  <span className="min-w-0 flex-1 truncate text-paper-500">{c.label}</span>
                  <span className="shrink-0 font-semibold tabular text-ink dark:text-paper">{c.count}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="surface p-5">
          <SectionHeader icon={Flag} title="Por prioridade" />
          <div className="flex items-center gap-4">
            <MiniDonut
              size={112}
              total={total}
              centerLabel="cards"
              rows={priorityCounts.map(({ priority, count }) => ({
                label: PRIORITY_LABEL[priority], color: PRIORITY_COLOR[priority], count,
              }))}
            />
            <ul className="min-w-0 flex-1 space-y-1.5">
              {priorityCounts.filter((p) => p.count > 0).map(({ priority, count }) => (
                <li key={priority} className="flex items-center gap-2 text-xs">
                  <span className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: PRIORITY_COLOR[priority] }} />
                  <span className="min-w-0 flex-1 truncate text-paper-500">{PRIORITY_LABEL[priority]}</span>
                  <span className="shrink-0 font-semibold tabular text-ink dark:text-paper">{count}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="surface p-5">
          <SectionHeader icon={Tags} title="Por tipo" />
          {typeCounts.length === 0 ? (
            <p className="text-sm text-paper-400">Sem cards.</p>
          ) : (
            <div className="flex items-center gap-4">
              <MiniDonut
                size={112}
                total={total}
                centerLabel="cards"
                rows={typeCounts.map(({ type, count }) => ({ label: TYPE_LABEL[type], color: TYPE_HEX[type], count }))}
              />
              <ul className="min-w-0 flex-1 space-y-1.5">
                {typeCounts.map(({ type, count }) => (
                  <li key={type} className="flex items-center gap-2 text-xs">
                    <span className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: TYPE_HEX[type] }} />
                    <span className="min-w-0 flex-1 truncate text-paper-500">{TYPE_LABEL[type]}</span>
                    <span className="shrink-0 font-semibold tabular text-ink dark:text-paper">{count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          {/* Carga por projeto */}
          <section className="surface p-5">
            <SectionHeader icon={Building2} title="Carga por projeto" />
            {projectRows.length === 0 ? (
              <p className="mt-3 text-sm text-paper-400">Nenhum card atribuído.</p>
            ) : (
              <div className="mt-4 space-y-4">
                {projectRows.map((p) => {
                  const pct = p.total > 0 ? Math.round((p.done / p.total) * 100) : 0
                  return (
                    <Link
                      key={p.id}
                      to={`/app/portfolio/${p.id}`}
                      className="block rounded-xl p-3 -mx-3 transition-colors hover:bg-paper-50 dark:hover:bg-ink-900"
                    >
                      <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
                        <span className="flex items-center gap-1.5 font-medium text-ink dark:text-paper">
                          <span className="font-mono text-[10px] text-paper-400">{p.key}</span>
                          {p.name}
                        </span>
                        <span className="shrink-0 text-paper-400 tabular">
                          {p.done}/{p.total} cards · {pct}%
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-paper-100 dark:bg-ink-800">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600 transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
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

          {/* Em aberto */}
          <section className="surface p-5">
            <SectionHeader icon={ListChecks} title={`Em aberto (${openCards.length})`} />
            {openCards.length === 0 ? (
              <p className="mt-3 text-sm text-paper-400">Nenhum card em aberto. 🎉</p>
            ) : (
              <ul className="mt-3 divide-y divide-paper-100 dark:divide-ink-800">
                {openCards.slice((pageClamped - 1) * PAGE_SIZE, pageClamped * PAGE_SIZE).map((c) => {
                  const meta = statusMeta.get(`${c.project_id}:${c.status}`)
                  const late = isOverdue(c)
                  return (
                    <li key={c.id} className="flex items-center gap-3 py-2.5">
                      <span className={cx("h-6 w-1 shrink-0 rounded-full", PRIORITY_BAR[c.priority])} />
                      <span className="min-w-0 flex-1">
                        <p className="truncate text-sm text-ink dark:text-paper">{c.title}</p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-paper-400">
                          <span className="font-mono">{c.ref}</span>
                          <span className="rounded bg-paper-50 px-1.5 py-0.5 font-medium text-paper-500 dark:bg-ink-900">
                            {c.projectKey}
                          </span>
                          <span className={cx("rounded px-1.5 py-0.5 font-medium", TYPE_COLOR[c.type])}>
                            {TYPE_LABEL[c.type]}
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="size-1.5 rounded-full" style={{ backgroundColor: meta?.color ?? "#8590A2" }} />
                            {meta?.name ?? c.status}
                          </span>
                          {late && (
                            <span className="flex items-center gap-1 font-medium text-danger">
                              <AlertTriangle className="size-3" /> atrasado
                            </span>
                          )}
                        </p>
                      </span>
                      {c.points != null && (
                        <span className="shrink-0 font-mono text-xs text-paper-400">{c.points}pt</span>
                      )}
                    </li>
                  )
                })}
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
                    onClick={() => setOpenPage((p) => Math.max(1, p - 1))}
                    disabled={pageClamped === 1}
                    className="rounded-lg border border-paper-200 bg-paper px-2.5 py-1 text-xs text-paper-500 transition-colors hover:bg-paper-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-ink-700 dark:bg-ink-900 dark:hover:bg-ink-800"
                  >
                    Anterior
                  </button>
                  <button
                    onClick={() => setOpenPage((p) => Math.min(totalPages, p + 1))}
                    disabled={pageClamped === totalPages}
                    className="rounded-lg border border-paper-200 bg-paper px-2.5 py-1 text-xs text-paper-500 transition-colors hover:bg-paper-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-ink-700 dark:bg-ink-900 dark:hover:bg-ink-800"
                  >
                    Próxima
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>

        <div className="space-y-6">
          {/* Atividade recente */}
          <section className="surface p-5">
            <SectionHeader icon={Clock} title="Atividade recente" />
            {recent.length === 0 ? (
              <p className="text-sm text-paper-400">Sem atividade registrada.</p>
            ) : (
              <ul className="space-y-2.5">
                {recent.map((c) => (
                  <li key={c.id} className="flex items-start gap-2 text-xs">
                    <span
                      className={cx(
                        "mt-1 size-1.5 shrink-0 rounded-full",
                        c.resolution === "done" ? "bg-success" : "bg-brand-500",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-ink dark:text-paper">{c.title}</p>
                      <p className="text-[10px] text-paper-400">
                        {c.projectKey} · {relativeDay(c.updated_at)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Atrasados */}
          {overdue.length > 0 && (
            <section className="surface border-danger/30 bg-danger/5 p-5">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold text-danger">
                <AlertTriangle className="size-4" /> Atrasados ({overdue.length})
              </h2>
              <ul className="mt-3 space-y-2">
                {overdue.slice(0, 6).map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate text-ink dark:text-paper">{c.title}</span>
                    <span className="shrink-0 font-mono text-[10px] text-danger">{c.due_date}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {projectRows.length === 1 && (
            <Link
              to={`/app/boards?project=${projectRows[0]!.id}&view=quadro`}
              className="surface flex items-center justify-center gap-2 p-4 text-sm font-medium text-brand-500 transition-colors hover:bg-paper-50 dark:hover:bg-ink-800 hover:text-brand-600"
            >
              Abrir quadro completo
              <ExternalLink className="size-4" />
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

function ProgressRing({ pct }: { pct: number }) {
  const r = 34
  const c = 2 * Math.PI * r
  const offset = c - (pct / 100) * c
  const stroke = pct >= 60 ? "stroke-success" : pct >= 30 ? "stroke-warning" : "stroke-danger"
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
