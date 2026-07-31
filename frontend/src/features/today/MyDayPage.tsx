import { motion, useInView, useMotionValue, useSpring } from "framer-motion"
import {
  Activity,
  AlertTriangle,
  Bell,
  CalendarClock,
  CalendarCheck,
  CalendarDays,
  CircleDot,
  ExternalLink,
  Eye,
  Flame,
  Loader2,
  RefreshCw,
  Sparkles,
  Target,
  TrendingDown,
  Video,
  Zap,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { useEffect, useMemo, useRef } from "react"
import { Link } from "react-router-dom"
import {
  Line,
  LineChart,
  CartesianGrid,
  ReferenceArea,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { useAuthStore } from "@/features/auth/auth.store"
import { useDayEvents, useGoogleStatus } from "@/features/integrations/integrations.hooks"
import type { CalendarEvent } from "@/features/integrations/integrations.types"
import {
  useNotifications,
  useWorkspaceCards,
  useWorkspaceSprints,
  useWorkspaces,
  type BoardCard,
} from "@/features/workspace/workspace.hooks"
import type {
  CardPriority,
  CardStatus,
  Notification,
  Sprint,
} from "@/features/workspace/workspace.types"
import { useWorkspaceActivities } from "@/features/sales/sales.hooks"
import { closeDateState, formatDate } from "@/features/sales/sales.shared"
import type { DealActivity } from "@/features/sales/sales.types"
import { cx } from "@/shared/ui/primitives"

const STATUS_LABEL: Record<CardStatus, string> = {
  backlog: "Backlog",
  todo: "A fazer",
  doing: "Em progresso",
  review: "Em revisão",
  done: "Concluído",
  briefing: "Briefing",
  criacao: "Criação",
  aprovacao: "Aprovação",
  agendado: "Agendado",
  publicado: "Publicado",
}

const STATUS_TONE: Record<CardStatus, string> = {
  backlog: "bg-paper-200 text-paper-500 dark:bg-ink-700 dark:text-paper-400",
  todo: "bg-paper-200 text-paper-500 dark:bg-ink-700 dark:text-paper-400",
  doing: "bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300",
  review: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  done: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  briefing: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  criacao: "bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300",
  aprovacao: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  agendado: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
  publicado: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
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

function greetingFor(hour: number): string {
  if (hour < 12) return "Bom dia"
  if (hour < 18) return "Boa tarde"
  return "Boa noite"
}

/** Data local (sem fuso) no formato YYYY-MM-DD — como o backend manda due_date. */
function todayISO(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  return `${d.getFullYear()}-${m}-${String(d.getDate()).padStart(2, "0")}`
}

function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00")
  d.setDate(d.getDate() + days)
  const m = String(d.getMonth() + 1).padStart(2, "0")
  return `${d.getFullYear()}-${m}-${String(d.getDate()).padStart(2, "0")}`
}

function diffDays(fromISO: string, toISO: string): number {
  return Math.round(
    (new Date(toISO + "T00:00:00").getTime() - new Date(fromISO + "T00:00:00").getTime()) / DAY_MS,
  )
}

/** "Hoje", "Amanhã" ou "Qua · 6 Ago" — o rótulo que o olho lê mais rápido. */
function relativeDayLabel(iso: string): string {
  const delta = diffDays(todayISO(), iso)
  if (delta === 0) return "Hoje"
  if (delta === 1) return "Amanhã"
  const d = new Date(iso + "T00:00:00")
  return `${DAY_NAMES[d.getDay()].slice(0, 3)} · ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`
}

function fmtHour(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

const listVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
}

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
}

const DAY_MS = 24 * 60 * 60 * 1000
function fmtAxisDate(iso: string): string {
  const d = new Date(iso + "T00:00:00")
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`
}

// Escolhe, entre todas as sprints ativas do workspace, a que tem mais cards
// atribuídos ao usuário — é essa que faz sentido "queimar" no burndown.
function pickRelevantSprint(sprints: Sprint[], myCards: BoardCard[]): Sprint | null {
  const active = sprints.filter((s) => s.status === "active")
  if (active.length === 0) return null
  let best = active[0]
  let bestCount = -1
  for (const s of active) {
    const count = myCards.filter((c) => c.sprint_id === s.id).length
    if (count > bestCount) {
      best = s
      bestCount = count
    }
  }
  return best
}

/**
 * Janela da sprint. Sprints antigas foram iniciadas sem start/end — em vez de
 * esconder o burndown, deriva de started_at e assume 2 semanas (padrão do time).
 */
function sprintWindow(sprint: Sprint | null): { start: string; end: string } | null {
  if (!sprint) return null
  const start = sprint.start_date ?? sprint.started_at?.slice(0, 10) ?? null
  if (!start) return null
  return { start, end: sprint.end_date ?? addDaysISO(start, 14) }
}

export function MyDayPage() {
  const user = useAuthStore((s) => s.user)
  const { activeWorkspaceId } = useWorkspaces()
  const { cards, isLoading } = useWorkspaceCards(activeWorkspaceId)
  const { sprints, isLoading: sprintsLoading } = useWorkspaceSprints(activeWorkspaceId)

  // Follow-ups do comercial: tarefas de negócio atribuídas a mim e ainda abertas.
  // O "Meu Dia" reúne o trabalho de todas as frentes, não só o dos boards.
  const { data: salesTasks } = useWorkspaceActivities(activeWorkspaceId, {
    kind: "task",
    assigneeId: user?.id,
    pending: true,
  })

  // Agenda do dia e notificações — o "Meu Dia" só é o dia inteiro se mostrar
  // também o que está no calendário e o que mudou nos meus cards.
  const { data: googleStatus } = useGoogleStatus()
  const googleConnected = !!googleStatus?.connected
  const { data: dayEvents, isLoading: eventsLoading } = useDayEvents(googleConnected, new Date())
  const { data: notifications } = useNotifications()

  const today = todayISO()
  const mine = cards.filter((c) => c.assignee_id === user?.id)
  const myActive = mine.filter((c) => ACTIVE.includes(c.status))
  const vencem = mine.filter((c) => c.due_date?.slice(0, 10) === today)
  // Atrasado = tem prazo no passado e ainda não foi concluído.
  const overdue = mine.filter(
    (c) => c.due_date != null && c.due_date.slice(0, 10) < today && c.status !== "done",
  )
  const inProgress = mine.filter((c) => c.status === "doing")
  const review = mine.filter((c) => c.status === "review")
  const done = mine.filter((c) => c.status === "done")
  const points = myActive.reduce((s, c) => s + (c.points ?? 0), 0)

  // Próximos 7 dias (exclui hoje, que já tem card próprio) agrupado por data.
  const upcoming = useMemo(() => {
    const limit = addDaysISO(today, 7)
    const rows = mine
      .filter((c) => {
        const due = c.due_date?.slice(0, 10)
        return !!due && due > today && due <= limit && c.status !== "done"
      })
      .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""))
    const groups = new Map<string, BoardCard[]>()
    for (const c of rows) {
      const key = c.due_date!.slice(0, 10)
      const bucket = groups.get(key)
      if (bucket) bucket.push(c)
      else groups.set(key, [c])
    }
    return [...groups.entries()]
  }, [mine, today])

  // Burndown real: escala o eixo X pelas datas de verdade da sprint ativa
  // (não mais um "D0..D10" arbitrário) e some quando não há sprint ativa —
  // em vez de desenhar um gráfico com dados inventados.
  const activeSprint = useMemo(() => pickRelevantSprint(sprints, mine), [sprints, mine])
  const sprintRange = useMemo(() => sprintWindow(activeSprint), [activeSprint])

  const sprintCards = activeSprint ? mine.filter((c) => c.sprint_id === activeSprint.id) : []
  const sprintDoneCards = sprintCards.filter((c) => c.status === "done")
  const sprintTotalPoints = sprintCards.reduce((s, c) => s + (c.points ?? 0), 0)
  const sprintDonePoints = sprintDoneCards.reduce((s, c) => s + (c.points ?? 0), 0)

  const burndownData = useMemo(() => {
    if (!sprintRange) return []
    const start = new Date(sprintRange.start + "T00:00:00")
    const end = new Date(sprintRange.end + "T00:00:00")
    const totalDays = Math.max(Math.round((end.getTime() - start.getTime()) / DAY_MS), 1)
    const todayIdx = Math.min(
      Math.max(Math.round((Date.now() - start.getTime()) / DAY_MS), 0),
      totalDays,
    )
    const remainingToday = Math.max(sprintTotalPoints - sprintDonePoints, 0)

    return Array.from({ length: totalDays + 1 }, (_, i) => {
      const date = new Date(start.getTime() + i * DAY_MS)
      const ideal = Math.max(sprintTotalPoints - (sprintTotalPoints / totalDays) * i, 0)
      // Sem histórico dia-a-dia real ainda: interpola uma reta do total (dia 0)
      // até o restante de hoje, só até o índice de hoje — não inventa depois disso.
      const real =
        i <= todayIdx
          ? remainingToday + ((sprintTotalPoints - remainingToday) * (todayIdx - i)) / Math.max(todayIdx, 1)
          : null
      return {
        date: date.toISOString().slice(0, 10),
        isToday: i === todayIdx,
        ideal: Math.round(ideal),
        real: real != null ? Math.round(real) : null,
      }
    })
  }, [sprintRange, sprintTotalPoints, sprintDonePoints])

  const firstName = user?.full_name?.split(/\s+/)[0] ?? "você"
  // Atrasado primeiro: é o que muda a ordem do dia. Depois em progresso/revisão.
  const focusCards = [
    ...overdue,
    ...inProgress.filter((c) => !overdue.includes(c)),
    ...review.filter((c) => !overdue.includes(c)),
    ...mine.filter((c) => c.status === "todo" && !overdue.includes(c)),
  ].slice(0, 6)

  return (
    <div className="space-y-6 pb-8">
      {/* Date header */}
      <p className="text-xs font-semibold tracking-[0.18em] text-paper-400 dark:text-ink-500">
        {formatDateHeader()}
      </p>

      {/* Greeting */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-ink dark:text-paper">
          {greetingFor(new Date().getHours())},{" "}
          <span className="bg-gradient-to-r from-brand-400 to-violet-400 bg-clip-text text-transparent">
            {firstName}
          </span>
        </h1>
        {myActive.length > 0 ? (
          <p className="mt-1.5 text-sm text-paper-500 dark:text-ink-400">
            Você tem{" "}
            <span className="font-semibold text-ink dark:text-paper-300">{myActive.length} cards ativos</span>{" "}
            e{" "}
            <span className="font-semibold text-ink dark:text-paper-300">{points} de peso</span>{" "}
            em aberto
            {activeSprint ? ` em ${activeSprint.name}` : ""}
            {overdue.length > 0 && (
              <>
                {" · "}
                <span className="font-semibold text-danger">{overdue.length} atrasado{overdue.length > 1 ? "s" : ""}</span>
              </>
            )}
            .
          </p>
        ) : (
          <p className="mt-1.5 text-sm text-paper-500 dark:text-ink-400">
            Nenhum card atribuído a você ainda. Bom dia!
          </p>
        )}
      </div>

      {isLoading || sprintsLoading ? (
        <div className="grid place-items-center py-20">
          <Loader2 className="size-6 animate-spin text-paper-400" />
        </div>
      ) : (
        <motion.div
          variants={listVariants}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 gap-4 xl:grid-cols-4"
        >
          {/* Stats */}
          <motion.div variants={itemVariants} className="xl:col-span-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <Stat icon={AlertTriangle} label="Atrasados" value={overdue.length} accent={overdue.length > 0 ? "text-danger" : undefined} tint="bg-danger/10 text-danger" />
              <Stat icon={CalendarClock} label="Vencem hoje" value={vencem.length} accent={vencem.length > 0 ? "text-warning" : undefined} tint="bg-warning/10 text-warning" />
              <Stat icon={RefreshCw} label="Em andamento" value={inProgress.length} tint="bg-sky-500/10 text-sky-500" />
              <Stat icon={Eye} label="Em revisão" value={review.length} accent="text-amber-500" tint="bg-amber-500/10 text-amber-500" />
              <Stat icon={Zap} label="Peso ativo" value={points} accent="text-brand-500" tint="bg-brand-500/10 text-brand-500" />
            </div>
          </motion.div>

          {/* Burndown */}
          <motion.div variants={itemVariants} className="xl:col-span-3">
            <BurndownCard
              data={burndownData}
              totalPoints={sprintTotalPoints}
              donePoints={sprintDonePoints}
              sprintName={activeSprint?.name ?? null}
            />
          </motion.div>

          {/* Pulse Intelligence + Resumo */}
          <motion.div variants={itemVariants} className="space-y-4 xl:col-span-1">
            <PulseIntelligence
              points={points}
              inProgressCount={inProgress.length}
              overdueCount={overdue.length}
              meetingsCount={dayEvents?.length ?? 0}
            />

            <SprintPulse
              sprint={activeSprint}
              range={sprintRange}
              cardCount={sprintCards.length}
              doneCount={sprintDoneCards.length}
              totalPoints={sprintTotalPoints}
              donePoints={sprintDonePoints}
            />

            <div className="surface p-4 space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-paper-400 dark:text-ink-500">
                Meus números
              </h3>
              <div className="flex flex-col gap-2.5">
                <SprintRow label="Cards atribuídos" value={mine.length} />
                <SprintRow label="Concluídos" value={done.length} highlight />
                <SprintRow label="Em progresso" value={inProgress.length} />
                <SprintRow label="Aguardando revisão" value={review.length} />
                <SprintRow label="Peso em aberto" value={points} />
              </div>
            </div>
          </motion.div>

          {/* Seu foco agora */}
          <motion.div variants={itemVariants} className="xl:col-span-3">
            <div className="surface p-5 lift">
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
                <motion.div
                  variants={listVariants}
                  initial="hidden"
                  animate="show"
                  className="flex flex-col divide-y divide-paper-100 dark:divide-ink-800"
                >
                  {focusCards.map((c) => (
                    <FocusCard key={c.id} card={c} />
                  ))}
                </motion.div>
              )}
            </div>
          </motion.div>

          {/* Minhas filas rápidas */}
          <motion.div variants={itemVariants} className="xl:col-span-1">
            <div className="flex flex-col gap-3">
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
              <SalesFollowUpsPanel tasks={salesTasks ?? []} />
            </div>
          </motion.div>

          {/* Agenda de hoje (Google Calendar) */}
          <motion.div variants={itemVariants} className="xl:col-span-2">
            <TodayAgenda
              events={dayEvents ?? []}
              connected={googleConnected}
              loading={eventsLoading}
            />
          </motion.div>

          {/* Próximos 7 dias */}
          <motion.div variants={itemVariants} className="xl:col-span-2">
            <UpcomingWeek groups={upcoming} />
          </motion.div>

          {/* Atividade recente */}
          <motion.div variants={itemVariants} className="xl:col-span-4">
            <RecentActivity items={notifications ?? []} />
          </motion.div>
        </motion.div>
      )}
    </div>
  )
}

function CountUp({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const isInView = useInView(ref, { once: true })
  const motionVal = useMotionValue(0)
  const spring = useSpring(motionVal, { duration: 0.8, bounce: 0.25 })

  useEffect(() => {
    if (isInView) motionVal.set(value)
  }, [isInView, value, motionVal])

  useEffect(() => {
    const unsub = spring.on("change", (v) => {
      if (ref.current) ref.current.textContent = String(Math.round(v))
    })
    return unsub
  }, [spring])

  return <span ref={ref}>0</span>
}

function Stat({
  icon: Icon,
  label,
  value,
  accent = "text-ink dark:text-paper",
  tint = "bg-brand-500/10 text-brand-500",
}: {
  icon: LucideIcon
  label: string
  value: number
  accent?: string
  tint?: string
}) {
  return (
    <div className="surface lift group relative overflow-hidden p-4 transition-transform hover:-translate-y-0.5">
      <div className="absolute -right-3 -top-3 size-14 rounded-full bg-brand-400/10 blur-xl transition-opacity group-hover:opacity-80" />
      <span className={cx("relative inline-flex size-9 items-center justify-center rounded-xl", tint)}>
        <Icon className="size-[18px]" strokeWidth={2} />
      </span>
      <p className={cx("relative mt-2 text-2xl font-bold tabular leading-none", accent)}>
        <CountUp value={value} />
      </p>
      <p className="relative mt-1.5 text-[12px] font-medium text-paper-500 dark:text-ink-400">{label}</p>
    </div>
  )
}

function BurndownCard({
  data,
  totalPoints,
  donePoints,
  sprintName,
}: {
  data: { date: string; isToday: boolean; ideal: number; real: number | null }[]
  totalPoints: number
  donePoints: number
  sprintName: string | null
}) {
  const pct = totalPoints > 0 ? Math.round((donePoints / totalPoints) * 100) : 0
  const todayIdx = data.findIndex((d) => d.isToday)

  return (
    <div className="surface p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <TrendingDown className="size-4 text-brand-500" strokeWidth={2} />
            <h2 className="text-sm font-semibold text-ink dark:text-paper">Burndown da sprint</h2>
          </div>
          {sprintName && <p className="mt-0.5 truncate text-xs text-paper-400">{sprintName}</p>}
        </div>
        {data.length > 0 && (
          <span className="shrink-0 rounded-full bg-brand-100 px-2.5 py-0.5 text-[11px] font-semibold text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
            {pct}% concluído
          </span>
        )}
      </div>

      {data.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-paper-200 dark:border-ink-700 text-center">
          <TrendingDown className="mb-1 size-6 text-paper-300" />
          <p className="text-sm font-medium text-paper-500">Nenhuma sprint ativa com datas definidas</p>
          <p className="text-xs text-paper-400">Inicie uma sprint com início/fim no board para ver o burndown aqui.</p>
        </div>
      ) : (
        <>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 5, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.15} />
                {todayIdx >= 0 && (
                  <ReferenceArea x1={data[0].date} x2={data[todayIdx].date} fill="#8270DB" fillOpacity={0.06} />
                )}
                <XAxis
                  dataKey="date"
                  tickFormatter={fmtAxisDate}
                  tick={{ fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={24}
                />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={32} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, fontSize: 12, border: "1px solid rgba(0,0,0,0.08)" }}
                  labelStyle={{ fontWeight: 600 }}
                  labelFormatter={(v) => fmtAxisDate(String(v))}
                />
                <Line
                  type="monotone"
                  dataKey="ideal"
                  stroke="#8590A2"
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                  dot={false}
                  name="Ideal"
                  isAnimationActive
                />
                <Line
                  type="monotone"
                  dataKey="real"
                  stroke="#8270DB"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 4 }}
                  name="Restante"
                  connectNulls
                  isAnimationActive
                  animationDuration={900}
                />
                {todayIdx >= 0 && data[todayIdx].real != null && (
                  <ReferenceDot
                    x={data[todayIdx].date}
                    y={data[todayIdx].real as number}
                    r={4}
                    fill="#8270DB"
                    stroke="white"
                    strokeWidth={2}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
          {donePoints === 0 && (
            <p className="mt-2 text-center text-[11px] text-paper-400">
              Nenhum ponto concluído ainda nesta sprint — a linha de restante só começa a cair quando um card for marcado como feito.
            </p>
          )}
        </>
      )}
    </div>
  )
}

function FocusCard({ card }: { card: BoardCard }) {
  const late = card.due_date != null && card.due_date.slice(0, 10) < todayISO() && card.status !== "done"
  return (
    <motion.div variants={itemVariants} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
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
      {late && (
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-danger/10 px-2 py-0.5 text-[11px] font-semibold text-danger">
          <AlertTriangle className="size-3" strokeWidth={2.2} />
          {relativeDayLabel(card.due_date!.slice(0, 10))}
        </span>
      )}
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
          peso {card.points}
        </span>
      )}
    </motion.div>
  )
}

// Follow-ups comerciais no Meu Dia. Ordena por prazo (vencidas primeiro) porque
// numa tarefa de venda o atraso é o dado que muda a decisão do dia.
function SalesFollowUpsPanel({ tasks }: { tasks: DealActivity[] }) {
  const ordered = useMemo(
    () =>
      [...tasks].sort((a, b) => {
        if (!a.due_date) return 1
        if (!b.due_date) return -1
        return a.due_date.localeCompare(b.due_date)
      }),
    [tasks],
  )

  return (
    <div className="surface flex flex-col p-4">
      <div className="mb-3 flex items-center gap-2">
        <Target className="size-4 text-brand-500" />
        <h3 className="text-sm font-semibold text-ink dark:text-paper">Follow-ups comerciais</h3>
        <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-paper-100 dark:bg-ink-800 px-1.5 text-[11px] font-medium text-paper-600 dark:text-paper-400">
          {ordered.length}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {ordered.slice(0, 4).map((t) => {
          const state = closeDateState(t.due_date)
          return (
            <Link
              key={t.id}
              to="/app/comercial"
              className="flex items-center gap-2 rounded-lg bg-paper-50 dark:bg-ink-800/60 px-3 py-2 text-sm text-ink dark:text-paper-200 transition-colors hover:bg-paper-100 dark:hover:bg-ink-800"
            >
              <span className="min-w-0 flex-1 truncate">
                {t.content}
                {t.deal_title && (
                  <span className="text-paper-400"> · {t.deal_title}</span>
                )}
              </span>
              {t.due_date && (
                <span
                  className={cx(
                    "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold",
                    state === "overdue"
                      ? "bg-danger/10 text-danger"
                      : state === "today"
                        ? "bg-warning/10 text-warning"
                        : "text-paper-400",
                  )}
                >
                  {state === "overdue"
                    ? "Atrasada"
                    : state === "today"
                      ? "Hoje"
                      : formatDate(t.due_date)}
                </span>
              )}
            </Link>
          )
        })}
        {ordered.length === 0 && (
          <p className="rounded-xl border border-dashed border-paper-200 dark:border-ink-700 py-5 text-center text-xs text-paper-400">
            Nenhum follow-up pendente.
          </p>
        )}
        {ordered.length > 4 && (
          <p className="text-center text-xs text-paper-400">+{ordered.length - 4} mais</p>
        )}
      </div>
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
            className="truncate rounded-lg bg-paper-50 dark:bg-ink-800/60 px-3 py-2 text-sm text-ink dark:text-paper-200 transition-colors hover:bg-paper-100 dark:hover:bg-ink-800"
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
  overdueCount,
  meetingsCount,
}: {
  points: number
  inProgressCount: number
  overdueCount: number
  meetingsCount: number
}) {
  // Ordem de prioridade da dica: atraso > agenda cheia > WIP alto > carga > calmo.
  const message =
    overdueCount > 0
      ? `${overdueCount} card${overdueCount > 1 ? "s" : ""} com prazo estourado. Comece por eles — atraso é o que mais custa depois.`
      : meetingsCount >= 4
        ? `${meetingsCount} reuniões hoje. Reserve um bloco só de execução antes que o dia acabe.`
        : inProgressCount > 3
          ? `Você tem ${inProgressCount} cards em andamento. Considere focar em concluir antes de puxar novos.`
          : points > 20
            ? `${points} de peso em aberto. Boa carga! Mantenha o ritmo.`
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

/**
 * Saúde da sprint em números que cabem numa olhada: quanto falta, quanto tempo
 * resta e qual ritmo diário fecha a sprint. Usa só cards DA sprint — o painel
 * "Meus números" continua olhando todos os meus cards.
 */
function SprintPulse({
  sprint,
  range,
  cardCount,
  doneCount,
  totalPoints,
  donePoints,
}: {
  sprint: Sprint | null
  range: { start: string; end: string } | null
  cardCount: number
  doneCount: number
  totalPoints: number
  donePoints: number
}) {
  if (!sprint) {
    return (
      <div className="surface p-4">
        <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-paper-400 dark:text-ink-500">
          Sprint
        </h3>
        <p className="mt-3 text-sm text-paper-500 dark:text-ink-400">
          Nenhuma sprint ativa.
        </p>
        <Link
          to="/app/boards"
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand-500 hover:text-brand-600"
        >
          Iniciar uma sprint no backlog
          <ExternalLink className="size-3" strokeWidth={2} />
        </Link>
      </div>
    )
  }

  const today = todayISO()
  const totalDays = range ? Math.max(diffDays(range.start, range.end), 1) : 0
  const elapsed = range ? Math.min(Math.max(diffDays(range.start, today), 0), totalDays) : 0
  const daysLeft = totalDays - elapsed
  const pct = totalPoints > 0 ? Math.round((donePoints / totalPoints) * 100) : 0
  const timePct = totalDays > 0 ? Math.round((elapsed / totalDays) * 100) : 0
  const remainingPoints = Math.max(totalPoints - donePoints, 0)
  // Ritmo necessário considera só os dias que ainda restam (mínimo 1).
  const pace = remainingPoints / Math.max(daysLeft, 1)
  // Adiantado quando o % concluído passa o % de tempo gasto.
  const ahead = pct >= timePct

  return (
    <div className="surface p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-paper-400 dark:text-ink-500">
            Sprint ativa
          </h3>
          <p className="truncate text-sm font-semibold text-ink dark:text-paper">{sprint.name}</p>
        </div>
        <span
          className={cx(
            "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold",
            daysLeft <= 1
              ? "bg-danger/10 text-danger"
              : daysLeft <= 3
                ? "bg-warning/10 text-warning"
                : "bg-paper-100 text-paper-600 dark:bg-ink-800 dark:text-paper-400",
          )}
        >
          {daysLeft <= 0 ? "Último dia" : `${daysLeft}d restantes`}
        </span>
      </div>

      {sprint.goal && (
        <p className="line-clamp-2 text-[12px] leading-relaxed text-paper-500 dark:text-ink-400">
          {sprint.goal}
        </p>
      )}

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between text-[12px]">
          <span className="text-paper-500 dark:text-ink-400">
            <span className="font-semibold text-ink dark:text-paper tabular">{donePoints}</span>
            <span className="text-paper-400"> / {totalPoints} pts</span>
          </span>
          <span className={cx("font-semibold tabular", ahead ? "text-green-500" : "text-warning")}>
            {pct}%
          </span>
        </div>
        <div className="relative h-2 overflow-hidden rounded-full bg-paper-100 dark:bg-ink-800">
          <motion.div
            className={cx(
              "h-full rounded-full",
              ahead ? "bg-green-500" : "bg-brand-500",
            )}
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          />
          {/* Marca de tempo decorrido: se a barra colorida está atrás dela, a sprint atrasou. */}
          <span
            className="absolute top-0 h-full w-px bg-ink/40 dark:bg-paper/40"
            style={{ left: `${timePct}%` }}
            title={`${timePct}% do tempo decorrido`}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2.5 pt-1">
        <SprintRow label="Cards na sprint" value={cardCount} />
        <SprintRow label="Concluídos" value={doneCount} highlight />
        <SprintRow label="Pontos restantes" value={remainingPoints} />
      </div>

      {remainingPoints > 0 && (
        <p className="flex items-center gap-1.5 rounded-lg bg-paper-50 dark:bg-ink-800/60 px-2.5 py-2 text-[11px] text-paper-500 dark:text-ink-400">
          <Flame className={cx("size-3.5 shrink-0", ahead ? "text-green-500" : "text-warning")} />
          Ritmo necessário: <span className="font-semibold tabular text-ink dark:text-paper">{pace.toFixed(1)} pts/dia</span>
        </p>
      )}
    </div>
  )
}

/** Reuniões de hoje. Sem Google conectado, mostra o CTA em vez de um vazio mudo. */
function TodayAgenda({
  events,
  connected,
  loading,
}: {
  events: CalendarEvent[]
  connected: boolean
  loading: boolean
}) {
  const now = Date.now()
  const ordered = useMemo(
    () => [...events].sort((a, b) => a.start.localeCompare(b.start)),
    [events],
  )
  const next = ordered.find((e) => !e.all_day && new Date(e.end).getTime() > now)

  return (
    <div className="surface p-5 lift">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarDays className="size-4 text-brand-500" strokeWidth={2} />
          <h2 className="text-sm font-semibold text-ink dark:text-paper">Agenda de hoje</h2>
          {connected && ordered.length > 0 && (
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-paper-100 dark:bg-ink-800 px-1.5 text-[11px] font-medium text-paper-600 dark:text-paper-400">
              {ordered.length}
            </span>
          )}
        </div>
        <Link
          to="/app/integrations"
          className="flex items-center gap-1 text-xs font-medium text-brand-500 transition-colors hover:text-brand-600 dark:hover:text-brand-400"
        >
          Calendário
          <ExternalLink className="size-3" strokeWidth={2} />
        </Link>
      </div>

      {!connected ? (
        <div className="rounded-xl border border-dashed border-paper-200 dark:border-ink-700 py-8 text-center">
          <p className="text-sm text-paper-500">Google Agenda não conectado</p>
          <Link to="/app/integrations" className="mt-1 inline-block text-xs font-medium text-brand-500 hover:text-brand-600">
            Conectar para ver suas reuniões aqui
          </Link>
        </div>
      ) : loading ? (
        <div className="grid place-items-center py-10">
          <Loader2 className="size-5 animate-spin text-paper-400" />
        </div>
      ) : ordered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-paper-200 dark:border-ink-700 py-8 text-center text-sm text-paper-400">
          Nenhuma reunião hoje. Dia livre para executar.
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-paper-100 dark:divide-ink-800">
          {ordered.slice(0, 5).map((e) => {
            const isNext = e.event_id === next?.event_id
            const past = !e.all_day && new Date(e.end).getTime() < now
            return (
              <div
                key={e.event_id}
                className={cx("flex items-center gap-3 py-2.5 first:pt-0 last:pb-0", past && "opacity-50")}
              >
                <span className="w-[74px] shrink-0 font-mono text-[11px] tabular text-paper-500 dark:text-ink-400">
                  {e.all_day ? "dia todo" : `${fmtHour(e.start)}–${fmtHour(e.end)}`}
                </span>
                <span
                  className={cx(
                    "h-7 w-1 shrink-0 rounded-full",
                    isNext ? "bg-brand-500" : "bg-paper-200 dark:bg-ink-700",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink dark:text-paper">{e.title}</p>
                  {e.attendees.length > 0 && (
                    <p className="mt-0.5 truncate text-[11px] text-paper-400">
                      {e.attendees.length} participante{e.attendees.length > 1 ? "s" : ""}
                    </p>
                  )}
                </div>
                {isNext && (
                  <span className="shrink-0 rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-semibold text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
                    Próxima
                  </span>
                )}
                {e.meet_link && (
                  <a
                    href={e.meet_link}
                    target="_blank"
                    rel="noreferrer"
                    className="flex shrink-0 items-center gap-1 rounded-lg bg-paper-50 dark:bg-ink-800 px-2 py-1 text-[11px] font-medium text-brand-500 transition-colors hover:bg-paper-100 dark:hover:bg-ink-700"
                  >
                    <Video className="size-3" strokeWidth={2} />
                    Entrar
                  </a>
                )}
              </div>
            )
          })}
          {ordered.length > 5 && (
            <p className="pt-2 text-center text-xs text-paper-400">+{ordered.length - 5} mais</p>
          )}
        </div>
      )}
    </div>
  )
}

/** Prazos dos próximos 7 dias, agrupados por dia — a "prévia" da semana. */
function UpcomingWeek({ groups }: { groups: [string, BoardCard[]][] }) {
  return (
    <div className="surface p-5 lift">
      <div className="mb-4 flex items-center gap-2">
        <CalendarCheck className="size-4 text-brand-500" strokeWidth={2} />
        <h2 className="text-sm font-semibold text-ink dark:text-paper">Próximos 7 dias</h2>
        <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-paper-100 dark:bg-ink-800 px-1.5 text-[11px] font-medium text-paper-600 dark:text-paper-400">
          {groups.reduce((s, [, cs]) => s + cs.length, 0)}
        </span>
      </div>

      {groups.length === 0 ? (
        <p className="rounded-xl border border-dashed border-paper-200 dark:border-ink-700 py-8 text-center text-sm text-paper-400">
          Nenhum prazo na próxima semana.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map(([day, dayCards]) => (
            <div key={day}>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-paper-400 dark:text-ink-500">
                {relativeDayLabel(day)}
              </p>
              <div className="flex flex-col gap-1.5">
                {dayCards.slice(0, 3).map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center gap-2 rounded-lg bg-paper-50 dark:bg-ink-800/60 px-3 py-2"
                  >
                    <span className={cx("h-5 w-1 shrink-0 rounded-full", PRIORITY_BAR[c.priority])} />
                    <span className="font-mono text-[11px] tabular text-paper-400 shrink-0">{c.ref}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-ink dark:text-paper-200">
                      {c.title}
                    </span>
                    <span
                      className={cx(
                        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                        STATUS_TONE[c.status],
                      )}
                    >
                      {STATUS_LABEL[c.status]}
                    </span>
                  </div>
                ))}
                {dayCards.length > 3 && (
                  <p className="text-center text-[11px] text-paper-400">
                    +{dayCards.length - 3} neste dia
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const NOTIF_ICON_TONE: Record<string, string> = {
  mention: "bg-violet-500/10 text-violet-500",
  card_assigned: "bg-brand-500/10 text-brand-500",
  sprint_started: "bg-green-500/10 text-green-500",
  comment: "bg-sky-500/10 text-sky-500",
}

/** Últimas mexidas nos meus cards + menções. Não lidas ganham destaque. */
function RecentActivity({ items }: { items: Notification[] }) {
  const ordered = useMemo(
    () => [...items].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 6),
    [items],
  )
  const unread = items.filter((n) => !n.read).length

  return (
    <div className="surface p-5 lift">
      <div className="mb-4 flex items-center gap-2">
        <Activity className="size-4 text-brand-500" strokeWidth={2} />
        <h2 className="text-sm font-semibold text-ink dark:text-paper">Atividade recente</h2>
        {unread > 0 && (
          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-brand-500 px-1.5 text-[11px] font-semibold text-white">
            {unread}
          </span>
        )}
      </div>

      {ordered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-paper-200 dark:border-ink-700 py-8 text-center text-sm text-paper-400">
          Nada novo por aqui.
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {ordered.map((n) => (
            <Link
              key={n.id}
              to={n.link?.startsWith("/app") ? n.link : `/app${n.link || "/boards"}`}
              className={cx(
                "flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors",
                n.read
                  ? "bg-paper-50 hover:bg-paper-100 dark:bg-ink-800/40 dark:hover:bg-ink-800"
                  : "bg-brand-50 hover:bg-brand-100 dark:bg-brand-900/20 dark:hover:bg-brand-900/30",
              )}
            >
              <span
                className={cx(
                  "mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg",
                  NOTIF_ICON_TONE[n.type] ?? "bg-paper-200/60 text-paper-500 dark:bg-ink-700 dark:text-paper-400",
                )}
              >
                <Bell className="size-3.5" strokeWidth={2} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-ink dark:text-paper">{n.title}</p>
                {n.body && (
                  <p className="truncate text-[11px] text-paper-500 dark:text-ink-400">{n.body}</p>
                )}
              </div>
              <span className="shrink-0 text-[11px] tabular text-paper-400">
                {relativeTime(n.created_at)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.round(diff / 60_000)
  if (min < 1) return "agora"
  if (min < 60) return `${min}min`
  const h = Math.round(min / 60)
  if (h < 24) return `${h}h`
  return `${Math.round(h / 24)}d`
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
        <CountUp value={value} />
      </span>
    </div>
  )
}
