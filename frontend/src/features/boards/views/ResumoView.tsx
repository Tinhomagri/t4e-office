// Aba Resumo — dashboard estilo "Resumo" do Jira: métricas dos últimos 7
// dias, visão geral de status (donut), atividade recente, prioridades,
// tipos de trabalho, carga da equipe e progresso de épicos.
import { useEffect, useRef, useState } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { CheckCircle2, Circle, ListChecks, PenLine, Plus, Sparkles } from "lucide-react"
import { cx } from "@/shared/ui/primitives"
import { useActivity } from "@/features/workspace/workspace.hooks"
import { ColoredAvatar } from "../board.shared"
import { ResumoDashboard } from "./ResumoDashboard"
import { isDelivered } from "./resumo.metrics"
import type { Card, CardPriority, CardStatus, CardType, Member, Sprint } from "@/features/workspace/workspace.types"

const STATUS_LABEL: Record<CardStatus, string> = {
  backlog: "Backlog", todo: "A fazer", doing: "Em andamento", review: "Em revisão", done: "Concluído",
  briefing: "Briefing", criacao: "Criação", aprovacao: "Aprovação", agendado: "Agendado", publicado: "Publicado",
}
// Paleta vibrante estilo Jira — cada status tem uma cor própria e reconhecível.
// Os tons saem das escalas do tailwind.config (Atlassian); antes eram os valores
// padrão do Tailwind, que não existem no design system.
const STATUS_COLOR: Record<CardStatus, string> = {
  backlog: "#8590A2", todo: "#8270DB", doing: "#E2B203", review: "#CD519D", done: "#22A06B",
  briefing: "#6E5DC6", criacao: "#0C66E4", aprovacao: "#E2B203", agendado: "#2898BD", publicado: "#22A06B",
}
const STATUS_BAR: Record<CardStatus, string> = {
  backlog: "bg-neutral-400", todo: "bg-purple-500", doing: "bg-yellow-500", review: "bg-magenta-500", done: "bg-green-500",
  briefing: "bg-purple-600", criacao: "bg-blue-500", aprovacao: "bg-yellow-500", agendado: "bg-teal-500", publicado: "bg-green-500",
}
const TYPE_LABEL: Record<CardType, string> = {
  feature: "História", bug: "Bug", debt: "Débito", spike: "Spike", chore: "Tarefa", epic: "Epic",
  post: "Post", peca: "Peça", campanha: "Campanha", artigo: "Artigo", email: "E-mail",
}
const TYPE_BAR: Record<CardType, string> = {
  feature: "bg-gradient-to-r from-blue-500 to-cyan-400",
  bug: "bg-gradient-to-r from-red-500 to-rose-400",
  debt: "bg-gradient-to-r from-orange-500 to-amber-400",
  spike: "bg-gradient-to-r from-cyan-500 to-teal-400",
  chore: "bg-gradient-to-r from-slate-500 to-slate-400",
  epic: "bg-gradient-to-r from-violet-500 to-fuchsia-400",
  post: "bg-gradient-to-r from-blue-500 to-cyan-400",
  peca: "bg-gradient-to-r from-slate-500 to-slate-400",
  campanha: "bg-gradient-to-r from-violet-500 to-fuchsia-400",
  artigo: "bg-gradient-to-r from-orange-500 to-amber-400",
  email: "bg-gradient-to-r from-amber-500 to-yellow-400",
}
const TYPE_DOT: Record<CardType, string> = {
  feature: "bg-blue-500", bug: "bg-red-500", debt: "bg-orange-500",
  spike: "bg-cyan-500", chore: "bg-slate-500", epic: "bg-violet-500",
  post: "bg-blue-500", peca: "bg-slate-500", campanha: "bg-violet-500",
  artigo: "bg-orange-500", email: "bg-amber-500",
}
const PRIORITY_LABEL: Record<CardPriority, string> = {
  urgent: "Highest", high: "High", medium: "Medium", low: "Low",
}
const PRIORITY_BAR: Record<CardPriority, string> = {
  urgent: "bg-gradient-to-t from-red-600 to-red-400",
  high: "bg-gradient-to-t from-orange-600 to-orange-400",
  medium: "bg-gradient-to-t from-amber-500 to-yellow-400",
  low: "bg-gradient-to-t from-emerald-600 to-emerald-400",
}
const PRIORITY_ORDER: CardPriority[] = ["urgent", "high", "medium", "low"]

const DAY_MS = 24 * 60 * 60 * 1000

function fieldLabel(field: string): string {
  const map: Record<string, string> = {
    status: "status", assignee_id: "responsável", priority: "prioridade",
    points: "story points", title: "título", sprint_id: "sprint", due_date: "prazo",
  }
  return map[field] ?? field
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.round(diffMs / 60000)
  if (mins < 1) return "agora"
  if (mins < 60) return `há ${mins}min`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `há ${hours}h`
  const days = Math.round(hours / 24)
  return `há ${days}d`
}

export function ResumoView({
  cards,
  members,
  projectId,
}: {
  cards: Card[]
  sprints: Sprint[]
  members: Member[]
  projectId: string | null
}) {
  const { data: activity } = useActivity(projectId)

  const now = Date.now()
  const last7 = now - 7 * DAY_MS
  const next7 = now + 7 * DAY_MS

  // Conclusão se mede por `resolved_at`, não por `updated_at`: um card entregue
  // meses atrás que alguém só comentou hoje não foi "concluído nesta semana".
  const completedLast7 = cards.filter(
    (c) => isDelivered(c) && c.resolved_at && new Date(c.resolved_at).getTime() >= last7,
  )
  const updatedLast7 = cards.filter((c) => c.updated_at && new Date(c.updated_at).getTime() >= last7)
  const createdLast7 = cards.filter((c) => c.created_at && new Date(c.created_at).getTime() >= last7)
  const dueNext7 = cards.filter(
    (c) => c.due_date && c.status !== "done" && new Date(c.due_date).getTime() <= next7 && new Date(c.due_date).getTime() >= now,
  )

  const statusCounts = (["backlog", "todo", "doing", "review", "done"] as CardStatus[]).map((s) => ({
    status: s, count: cards.filter((c) => c.status === s).length,
  })).filter((s) => s.count > 0)
  const total = cards.length || 1

  const byType = Object.fromEntries(
    (["feature", "bug", "debt", "spike", "chore", "epic"] as CardType[]).map((t) => [
      t, cards.filter((c) => c.type === t).length,
    ]),
  ) as Record<CardType, number>

  const byPriority = Object.fromEntries(
    PRIORITY_ORDER.map((p) => [p, cards.filter((c) => c.priority === p).length]),
  ) as Record<CardPriority, number>
  const maxPriority = Math.max(1, ...PRIORITY_ORDER.map((p) => byPriority[p]))

  const epics = cards.filter((c) => c.type === "epic")

  return (
    <div className="space-y-5">
      {/* Métricas dos últimos/próximos 7 dias */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          icon={<CheckCircle2 className="size-4" />}
          chip="bg-green-100 text-green-600 dark:bg-green-500/15 dark:text-green-400"
          accent="from-green-500 to-emerald-400"
          value={completedLast7.length} label="concluído(s)" sub="nos últimos 7 dias" index={0}
        />
        <MetricCard
          icon={<PenLine className="size-4" />}
          chip="bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400"
          accent="from-blue-500 to-cyan-400"
          value={updatedLast7.length} label="atualizado(s)" sub="nos últimos 7 dias" index={1}
        />
        <MetricCard
          icon={<Plus className="size-4" />}
          chip="bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400"
          accent="from-violet-500 to-fuchsia-400"
          value={createdLast7.length} label="criado(s)" sub="nos últimos 7 dias" index={2}
        />
        <MetricCard
          icon={<ListChecks className="size-4" />}
          chip="bg-orange-100 text-orange-600 dark:bg-orange-500/15 dark:text-orange-400"
          accent="from-orange-500 to-amber-400"
          value={dueNext7.length} label="a ser(em) entregue(s)" sub="nos próximos 7 dias" index={3}
        />
      </div>

      {/* Dashboard: donuts por status/tipo/responsável, tendências e detalhes. */}
      <ResumoDashboard cards={cards} members={members} />

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Visão geral do status */}
        <section className="rounded-2xl border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-900 p-5 shadow-card">
          <p className="text-sm font-semibold text-ink dark:text-paper">Visão geral do status</p>
          <p className="mt-0.5 text-xs text-paper-400">Tenha acesso à visão geral do status dos tickets.</p>
          <div className="mt-5 flex items-center gap-6">
            <Donut segments={statusCounts.map((s) => ({ value: s.count, color: STATUS_COLOR[s.status] }))} total={total} centerLabel="Total de tickets" />
            <div className="flex-1 space-y-2">
              {statusCounts.map((s) => (
                <div key={s.status} className="flex items-center gap-2 text-sm">
                  <span className={cx("size-2.5 shrink-0 rounded-sm", STATUS_BAR[s.status])} />
                  <span className="flex-1 text-paper-500">{STATUS_LABEL[s.status]}</span>
                  <span className="font-semibold text-ink dark:text-paper">{s.count}</span>
                </div>
              ))}
              {statusCounts.length === 0 && <p className="text-sm text-paper-400">Nenhum ticket ainda.</p>}
            </div>
          </div>
        </section>

        {/* Atividade recente */}
        <section className="rounded-2xl border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-900 p-5 shadow-card">
          <p className="text-sm font-semibold text-ink dark:text-paper">Atividade recente</p>
          <p className="mt-0.5 text-xs text-paper-400">Esteja atualizado com o que está acontecendo no projeto.</p>
          <div className="mt-4 max-h-64 space-y-3 overflow-y-auto scrollbar-slim pr-1">
            {(activity ?? []).map((a) => (
              <div key={a.id} className="flex items-start gap-2.5">
                <ColoredAvatar name={a.author_name} />
                <p className="text-[13px] leading-snug text-paper-600 dark:text-paper-400">
                  <span className="font-medium text-ink dark:text-paper">{a.author_name}</span>{" "}
                  atualizou {fieldLabel(a.field)} em{" "}
                  <span className="font-medium text-brand-600">{a.card_ref}</span>
                  <span className="block text-[11px] text-paper-400">{timeAgo(a.created_at)}</span>
                </p>
              </div>
            ))}
            {(!activity || activity.length === 0) && (
              <p className="text-sm text-paper-400">Nenhuma atividade recente.</p>
            )}
          </div>
        </section>

        {/* Informações sobre prioridades */}
        <section className="rounded-2xl border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-900 p-5 shadow-card">
          <p className="text-sm font-semibold text-ink dark:text-paper">Informações sobre prioridades</p>
          <p className="mt-0.5 text-xs text-paper-400">Visão de como o trabalho está sendo priorizado.</p>
          <div className="mt-6 flex h-40 items-end gap-4">
            {PRIORITY_ORDER.map((p) => (
              <div key={p} className="flex flex-1 flex-col items-center gap-2">
                <span className="text-xs font-semibold text-ink dark:text-paper">{byPriority[p] || ""}</span>
                <div className="flex h-32 w-full items-end">
                  <div
                    className={cx("w-full rounded-t-md shadow-sm", PRIORITY_BAR[p])}
                    style={{ height: `${(byPriority[p] / maxPriority) * 100}%`, minHeight: byPriority[p] > 0 ? 6 : 0 }}
                  />
                </div>
                <span className="text-[11px] font-medium text-paper-400">{PRIORITY_LABEL[p]}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Tipos de trabalho */}
        <section className="rounded-2xl border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-900 p-5 shadow-card">
          <p className="text-sm font-semibold text-ink dark:text-paper">Tipos de trabalho</p>
          <p className="mt-0.5 text-xs text-paper-400">Informações dos tickets por tipo.</p>
          <div className="mt-4 space-y-3">
            {(Object.keys(TYPE_LABEL) as CardType[])
              .filter((t) => byType[t] > 0)
              .sort((a, b) => byType[b] - byType[a])
              .map((t) => (
                <div key={t} className="flex items-center gap-3">
                  <span className={cx("size-2 shrink-0 rounded-full", TYPE_DOT[t])} />
                  <span className="w-16 shrink-0 text-xs text-paper-500">{TYPE_LABEL[t]}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-paper-100 dark:bg-ink-800">
                    <div className={cx("h-full rounded-full", TYPE_BAR[t])} style={{ width: `${(byType[t] / total) * 100}%` }} />
                  </div>
                  <span className="w-6 text-right text-xs font-semibold text-ink dark:text-paper">{byType[t]}</span>
                </div>
              ))}
            {cards.length === 0 && <p className="text-sm text-paper-400">Nenhum ticket ainda.</p>}
          </div>
        </section>

        {/* Carga de trabalho da equipe */}
        <section className="rounded-2xl border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-900 p-5 shadow-card">
          <p className="text-sm font-semibold text-ink dark:text-paper">Carga de trabalho da equipe</p>
          <p className="mt-0.5 text-xs text-paper-400">Monitore a capacidade da equipe.</p>
          <div className="mt-4 space-y-3">
            {members.map((m) => {
              const open = cards.filter((c) => c.assignee_id === m.user_id && c.status !== "done")
              const pct = Math.round((open.length / Math.max(1, cards.filter((c) => c.status !== "done").length)) * 100)
              return (
                <div key={m.user_id} className="flex items-center gap-3">
                  <ColoredAvatar name={m.name} />
                  <span className="w-24 shrink-0 truncate text-xs text-paper-500">{m.name}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-paper-100 dark:bg-ink-800">
                    <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-cyan-400" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-8 text-right text-xs font-semibold text-ink dark:text-paper">{open.length}</span>
                </div>
              )
            })}
            {(() => {
              const unassigned = cards.filter((c) => !c.assignee_id && c.status !== "done")
              return unassigned.length > 0 ? (
                <div className="flex items-center gap-3">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-paper-100 dark:bg-ink-800 text-[9px] font-semibold text-paper-400">?</span>
                  <span className="w-24 shrink-0 truncate text-xs text-paper-500">Não atribuído</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-paper-100 dark:bg-ink-800">
                    <div
                      className="h-full rounded-full bg-paper-300 dark:bg-ink-600"
                      style={{ width: `${Math.round((unassigned.length / Math.max(1, cards.filter((c) => c.status !== "done").length)) * 100)}%` }}
                    />
                  </div>
                  <span className="w-8 text-right text-xs font-semibold text-ink dark:text-paper">{unassigned.length}</span>
                </div>
              ) : null
            })()}
            {members.length === 0 && <p className="text-sm text-paper-400">Nenhum membro no workspace.</p>}
          </div>
        </section>

        {/* Progresso de épico */}
        <section className="rounded-2xl border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-900 p-5 shadow-card">
          <div className="flex items-center gap-1.5">
            <Sparkles className="size-3.5 text-violet-500" />
            <p className="text-sm font-semibold text-ink dark:text-paper">Progresso de épico</p>
          </div>
          <p className="mt-0.5 text-xs text-paper-400">Veja como os épicos estão progredindo.</p>
          <div className="mt-4 max-h-64 space-y-4 overflow-y-auto scrollbar-slim pr-1">
            {epics.map((e) => {
              const children = cards.filter((c) => c.epic_id === e.id)
              const done = children.filter((c) => c.status === "done").length
              const doing = children.filter((c) => c.status === "doing" || c.status === "review").length
              const pctDone = children.length > 0 ? (done / children.length) * 100 : 0
              const pctDoing = children.length > 0 ? (doing / children.length) * 100 : 0
              return (
                <div key={e.id}>
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="font-medium text-ink dark:text-paper">{e.ref} {e.title}</span>
                    <span className="text-paper-400">{done}/{children.length}</span>
                  </div>
                  <div className="flex h-2 overflow-hidden rounded-full bg-paper-100 dark:bg-ink-800">
                    <div className="h-full bg-gradient-to-r from-green-500 to-emerald-400" style={{ width: `${pctDone}%` }} />
                    <div className="h-full bg-gradient-to-r from-amber-400 to-orange-400" style={{ width: `${pctDoing}%` }} />
                  </div>
                </div>
              )
            })}
            {epics.length === 0 && (
              <div className="py-4 text-center">
                <Circle className="mx-auto mb-2 size-6 text-paper-300" />
                <p className="text-sm text-paper-400">Nenhum épico criado ainda.</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

/** Conta de 0 até `value` na abertura. Depois disso, valor novo entra direto:
 *  ficar recontando a cada atualização em segundo plano cansa mais do que
 *  informa. `tabular` no número evita o texto "dançar" enquanto os dígitos
 *  mudam. */
function useCountUp(value: number, durationMs: number, delayMs: number): number {
  const reduce = useReducedMotion()
  const [shown, setShown] = useState(reduce ? value : 0)
  const done = useRef(false)

  useEffect(() => {
    if (reduce || done.current) {
      setShown(value)
      return
    }
    let frame = 0
    let start = 0
    const step = (t: number) => {
      if (!start) start = t + delayMs
      const progress = Math.min(1, Math.max(0, (t - start) / durationMs))
      // easeOutCubic: rápido no começo, assenta no fim.
      setShown(Math.round(value * (1 - (1 - progress) ** 3)))
      if (progress < 1) frame = requestAnimationFrame(step)
      else done.current = true
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [value, durationMs, delayMs, reduce])

  return shown
}

function MetricCard({
  icon, chip, accent, value, label, sub, index = 0,
}: {
  icon: React.ReactNode
  chip: string
  accent: string
  value: number
  label: string
  sub: string
  index?: number
}) {
  const reduce = useReducedMotion()
  const delay = index * 70
  const shown = useCountUp(value, 700, delay)
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: delay / 1000 }}
      className="relative overflow-hidden rounded-2xl border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-900 p-4 shadow-card"
    >
      <motion.span
        className={cx("absolute inset-x-0 top-0 h-1 origin-left bg-gradient-to-r", accent)}
        initial={reduce ? false : { scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1], delay: delay / 1000 + 0.1 }}
      />
      <div className="flex items-center gap-2.5">
        <span className={cx("grid size-8 place-items-center rounded-xl", chip)}>{icon}</span>
        <span className="text-2xl font-bold tabular text-ink dark:text-paper">{shown}</span>
      </div>
      <p className="mt-2 text-xs font-medium text-paper-500">{label}</p>
      <p className="text-[11px] text-paper-400">{sub}</p>
    </motion.div>
  )
}

function Donut({ segments, total, centerLabel }: { segments: { value: number; color: string }[]; total: number; centerLabel: string }) {
  let acc = 0
  const stops = segments.map((s) => {
    const start = (acc / total) * 360
    acc += s.value
    const end = (acc / total) * 360
    return `${s.color} ${start}deg ${end}deg`
  })
  const gradient = stops.length > 0 ? `conic-gradient(${stops.join(", ")})` : "conic-gradient(#DCDFE4 0deg 360deg)"
  return (
    <div className="relative size-36 shrink-0 rounded-full" style={{ background: gradient }}>
      <div className="absolute inset-3 grid place-items-center rounded-full bg-paper dark:bg-ink-900 text-center">
        <div>
          <p className="text-2xl font-bold text-ink dark:text-paper">{total}</p>
          <p className="text-[10px] text-paper-400">{centerLabel}</p>
        </div>
      </div>
    </div>
  )
}
