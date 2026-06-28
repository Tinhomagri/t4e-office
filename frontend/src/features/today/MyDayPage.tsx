import { CalendarCheck, CircleDot, ExternalLink, Loader2, Sparkles, Zap } from "lucide-react"
import { Link } from "react-router-dom"

import { useAuthStore } from "@/features/auth/auth.store"
import {
  useWorkspaceCards,
  useWorkspaces,
  type BoardCard,
} from "@/features/workspace/workspace.hooks"
import type { CardPriority, CardStatus } from "@/features/workspace/workspace.types"
import { cx } from "@/shared/ui/primitives"

const STATUS_LABEL: Record<CardStatus, string> = {
  backlog: "Backlog",
  todo: "A fazer",
  doing: "Em progresso",
  review: "Em revisão",
  done: "Concluído",
}

const STATUS_TONE: Record<CardStatus, string> = {
  backlog: "bg-paper-200 text-paper-500 dark:bg-ink-700 dark:text-paper-400",
  todo: "bg-paper-200 text-paper-500 dark:bg-ink-700 dark:text-paper-400",
  doing: "bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300",
  review: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  done: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
}

const PRIORITY_BAR: Record<CardPriority, string> = {
  low: "bg-paper-300 dark:bg-ink-600",
  medium: "bg-brand-400",
  high: "bg-warning",
  urgent: "bg-danger",
}

const ACTIVE: CardStatus[] = ["todo", "doing", "review"]

const DAY_NAMES = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"]
const MONTH_NAMES = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
]

function formatDateHeader() {
  const now = new Date()
  return `${DAY_NAMES[now.getDay()].toUpperCase()} · ${now.getDate()} ${MONTH_NAMES[now.getMonth()].toUpperCase()}`
}

export function MyDayPage() {
  const user = useAuthStore((s) => s.user)
  const { activeWorkspaceId } = useWorkspaces()
  const { cards, isLoading } = useWorkspaceCards(activeWorkspaceId)

  const mine = cards.filter((c) => c.assignee_id === user?.id)
  const myActive = mine.filter((c) => ACTIVE.includes(c.status))
  const vencem = mine.filter((c) => {
    if (!c.due_date) return false
    const due = new Date(c.due_date)
    const today = new Date()
    return (
      due.getFullYear() === today.getFullYear() &&
      due.getMonth() === today.getMonth() &&
      due.getDate() === today.getDate()
    )
  })
  const inProgress = mine.filter((c) => c.status === "doing")
  const review = mine.filter((c) => c.status === "review")
  const points = myActive.reduce((s, c) => s + (c.points ?? 0), 0)

  const firstName = user?.full_name?.split(/\s+/)[0] ?? "você"
  const focusCards = [...inProgress, ...review, ...mine.filter((c) => c.status === "todo")].slice(0, 5)

  return (
    <div className="space-y-6 pb-8">
      {/* Date header */}
      <p className="text-xs font-semibold tracking-[0.18em] text-paper-400 dark:text-ink-500">
        {formatDateHeader()}
      </p>

      {/* Greeting */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-ink dark:text-paper">
          Bom dia,{" "}
          <span className="bg-gradient-to-r from-brand-400 to-violet-400 bg-clip-text text-transparent">
            {firstName}
          </span>
        </h1>
        {myActive.length > 0 ? (
          <p className="mt-1.5 text-sm text-paper-500 dark:text-ink-400">
            Você tem{" "}
            <span className="font-semibold text-ink dark:text-paper-300">{myActive.length} cards ativos</span>{" "}
            e{" "}
            <span className="font-semibold text-ink dark:text-paper-300">{points} pontos</span>{" "}
            em aberto nesta sprint.
          </p>
        ) : (
          <p className="mt-1.5 text-sm text-paper-500 dark:text-ink-400">
            Nenhum card atribuído a você ainda. Bom dia!
          </p>
        )}
      </div>

      {isLoading ? (
        <div className="grid place-items-center py-20">
          <Loader2 className="size-6 animate-spin text-paper-400" />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          {/* Left column */}
          <div className="space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat icon="📅" label="Vencem hoje" value={vencem.length} accent="text-danger" />
              <Stat icon="🔄" label="Em andamento" value={inProgress.length} />
              <Stat icon="👀" label="Em revisão" value={review.length} accent="text-amber-500" />
              <Stat icon="⚡" label="Pontos ativos" value={points} accent="text-brand-500" />
            </div>

            {/* Seu foco agora */}
            <div className="surface p-5">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CircleDot className="size-4 text-brand-500" strokeWidth={2} />
                  <h2 className="text-sm font-semibold text-ink dark:text-paper">Seu foco agora</h2>
                </div>
                <Link
                  to="/app/boards"
                  className="flex items-center gap-1 text-xs font-medium text-brand-500 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                >
                  Ver no board
                  <ExternalLink className="size-3" strokeWidth={2} />
                </Link>
              </div>

              {focusCards.length === 0 ? (
                <p className="rounded-xl border border-dashed border-paper-200 dark:border-ink-700 py-8 text-center text-sm text-paper-400">
                  Nenhum card atribuído a você.
                </p>
              ) : (
                <div className="flex flex-col divide-y divide-paper-100 dark:divide-ink-800">
                  {focusCards.map((c) => (
                    <FocusCard key={c.id} card={c} />
                  ))}
                </div>
              )}
            </div>

            {/* Minhas filas rápidas */}
            <div className="grid gap-3 sm:grid-cols-2">
              <MiniPanel
                title="A fazer"
                icon={<CalendarCheck className="size-4 text-paper-500 dark:text-ink-400" />}
                cards={mine.filter((c) => c.status === "todo")}
                empty="Fila limpa."
              />
              <MiniPanel
                title="Em revisão"
                icon={<Sparkles className="size-4 text-warning" />}
                cards={review}
                empty="Nenhum card em revisão."
              />
            </div>
          </div>

          {/* Right column — Pulse Intelligence */}
          <div className="space-y-4">
            <PulseIntelligence points={points} inProgressCount={inProgress.length} />

            {/* Sprint summary */}
            <div className="surface p-4 space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-paper-400 dark:text-ink-500">
                Resumo da sprint
              </h3>
              <div className="flex flex-col gap-2.5">
                <SprintRow label="Total de cards" value={mine.length} />
                <SprintRow label="Concluídos" value={mine.filter((c) => c.status === "done").length} highlight />
                <SprintRow label="Em progresso" value={inProgress.length} />
                <SprintRow label="Aguardando" value={review.length} />
                <SprintRow label="Story points" value={points} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({
  icon,
  label,
  value,
  accent = "text-ink dark:text-paper",
}: {
  icon: string
  label: string
  value: number
  accent?: string
}) {
  return (
    <div className="surface p-4">
      <span className="text-xl">{icon}</span>
      <p className={cx("mt-2 text-2xl font-bold tabular leading-none", accent)}>{value}</p>
      <p className="mt-1.5 text-[12px] font-medium text-paper-500 dark:text-ink-400">{label}</p>
    </div>
  )
}

function FocusCard({ card }: { card: BoardCard }) {
  return (
    <div className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
      <span
        className={cx(
          "h-8 w-1 shrink-0 rounded-full",
          PRIORITY_BAR[card.priority],
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[11px] text-paper-400 tabular shrink-0">{card.ref}</span>
          <p className="truncate text-sm text-ink dark:text-paper">{card.title}</p>
        </div>
        <p className="mt-0.5 text-[11px] text-paper-400 dark:text-ink-500">{card.projectName}</p>
      </div>
      <span
        className={cx(
          "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
          STATUS_TONE[card.status],
        )}
      >
        {STATUS_LABEL[card.status]}
      </span>
      {card.points != null && card.points > 0 && (
        <span className="shrink-0 rounded-md bg-paper-100 dark:bg-ink-700 px-1.5 py-0.5 text-[11px] font-medium text-paper-500 dark:text-paper-400 tabular">
          {card.points}pts
        </span>
      )}
    </div>
  )
}

function MiniPanel({
  title,
  icon,
  cards,
  empty,
}: {
  title: string
  icon: React.ReactNode
  cards: BoardCard[]
  empty: string
}) {
  return (
    <div className="surface flex flex-col p-4">
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-semibold text-ink dark:text-paper">{title}</h3>
        <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-paper-100 dark:bg-ink-800 px-1.5 text-[11px] font-medium text-paper-600 dark:text-paper-400">
          {cards.length}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {cards.slice(0, 4).map((c) => (
          <div
            key={c.id}
            className="truncate rounded-lg bg-paper-50 dark:bg-ink-800/60 px-3 py-2 text-sm text-ink dark:text-paper-200"
          >
            {c.title}
          </div>
        ))}
        {cards.length === 0 && (
          <p className="rounded-xl border border-dashed border-paper-200 dark:border-ink-700 py-5 text-center text-xs text-paper-400">
            {empty}
          </p>
        )}
        {cards.length > 4 && (
          <p className="text-center text-xs text-paper-400">+{cards.length - 4} mais</p>
        )}
      </div>
    </div>
  )
}

function PulseIntelligence({
  points,
  inProgressCount,
}: {
  points: number
  inProgressCount: number
}) {
  const message =
    inProgressCount > 3
      ? `Você tem ${inProgressCount} cards em andamento. Considere focar em concluir antes de puxar novos.`
      : points > 20
        ? `${points} pontos em aberto. Boa carga! Mantenha o ritmo.`
        : "Sua sprint está tranquila. Bom momento para antecipar itens do backlog."

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-500 via-violet-500 to-indigo-600 p-5 text-white shadow-brand-glow">
      <div className="absolute -right-4 -top-4 size-24 rounded-full bg-white/10 blur-xl" />
      <div className="absolute -bottom-6 -left-2 size-20 rounded-full bg-white/10 blur-xl" />
      <div className="relative">
        <div className="mb-3 flex items-center gap-2">
          <Zap className="size-4" strokeWidth={2.2} />
          <span className="text-sm font-semibold">Pulse Intelligence</span>
        </div>
        <p className="text-[13px] leading-relaxed text-white/90">"{message}"</p>
        <button className="mt-4 rounded-xl bg-white/20 px-4 py-2 text-xs font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/30">
          Ver sugestões
        </button>
      </div>
    </div>
  )
}

function SprintRow({
  label,
  value,
  highlight,
}: {
  label: string
  value: number
  highlight?: boolean
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[13px] text-paper-500 dark:text-ink-400">{label}</span>
      <span
        className={cx(
          "text-[13px] font-semibold tabular",
          highlight ? "text-green-500 dark:text-green-400" : "text-ink dark:text-paper",
        )}
      >
        {value}
      </span>
    </div>
  )
}
