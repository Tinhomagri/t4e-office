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
  useMyWork,
  useNotifications,
  useProjectReports,
  useWorkspaces,
  type BoardCard,
} from "@/features/workspace/workspace.hooks"
import type { ProjectReports } from "@/features/workspace/workspace.api"
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

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * O card foi ENTREGUE?
 *
 * Espelha `CardResolution.counts_as_delivered` do backend. Estar na coluna
 * "Concluído" não é entrega: um card marcado como "não será feito" ou
 * "duplicado" também sai por ali. Contar por status inflava "concluídos" com
 * trabalho que ninguém fez — o mesmo erro que já corrigimos no Resumo.
 * Cards antigos sem `resolution` caem no status (o backfill da migration 0023
 * cobre o histórico, mas nem todo card passa pelo fluxo normal).
 */
export function isDelivered(c: BoardCard): boolean {
  if (c.resolution) return c.resolution === "done"
  return c.status === "done"
}

/** Já saiu do fluxo — está na coluna Concluído, entregue ou não. */
export function isClosed(c: BoardCard): boolean {
  return c.status === "done"
}

/**
 * Fatia os cards do workspace nas listas que a tela usa.
 *
 * Pura e exportada de propósito: é aqui que moram as definições de "atrasado",
 * "vence hoje" e "entregue", e é aqui que os erros de contagem apareciam.
 */
export function sliceMyDay(cards: BoardCard[], userId: string | undefined, today: string) {
  const mine = cards.filter((c) => c.assignee_id === userId)
  const open = mine.filter((c) => !isClosed(c))
  return {
    mine,
    active: mine.filter((c) => ACTIVE.includes(c.status)),
    // Vence hoje só conta o que ainda está aberto: card entregue hoje não é
    // pendência do dia — contá-lo inflava o KPI todo fim de sprint.
    dueToday: open.filter((c) => c.due_date?.slice(0, 10) === today),
    overdue: open.filter((c) => c.due_date != null && c.due_date.slice(0, 10) < today),
    inProgress: mine.filter((c) => c.status === "doing"),
    review: mine.filter((c) => c.status === "review"),
    todo: mine.filter((c) => c.status === "todo"),
    delivered: mine.filter(isDelivered),
  }
}

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
  if (delta === -1) return "Ontem"
  if (delta < 0) return `${-delta}d atrás`
  const d = new Date(iso + "T00:00:00")
  return `${DAY_NAMES[d.getDay()].slice(0, 3)} · ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`
}

function fmtHour(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

function fmtAxisDate(iso: string): string {
  const d = new Date(iso + "T00:00:00")
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`
}

const listVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
}

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
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
 * esconder os prazos, deriva de started_at e assume 2 semanas (padrão do time).
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
  // Cards e sprints vêm de /api/me/work/, que agrega TODOS os workspaces da
  // pessoa. O workspace ativo abaixo só serve ao comercial, cujo endpoint de
  // atividades ainda é por workspace.
  const { cards, sprints, isLoading } = useMyWork()
  const sprintsLoading = isLoading

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
  const userId = user?.id

  // Uma passada só sobre os cards, memoizada pela identidade de `cards` (que o
  // react-query mantém estável entre renders). Antes cada `filter` rodava a cada
  // render e os `useMemo` abaixo dependiam de arrays recém-criados — ou seja,
  // memo nenhum.
  const my = useMemo(() => sliceMyDay(cards, userId, today), [cards, userId, today])

  const points = useMemo(
    () => my.active.reduce((s, c) => s + (c.points ?? 0), 0),
    [my.active],
  )

  // Próximos 7 dias (exclui hoje, que já tem KPI próprio) agrupado por data.
  const upcoming = useMemo(() => {
    const limit = addDaysISO(today, 7)
    const rows = my.mine
      .filter((c) => {
        const due = c.due_date?.slice(0, 10)
        return !!due && due > today && due <= limit && !isClosed(c)
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
  }, [my.mine, today])

  const activeSprint = useMemo(
    () => pickRelevantSprint(sprints, my.mine),
    [sprints, my.mine],
  )
  const sprintRange = useMemo(() => sprintWindow(activeSprint), [activeSprint])

  // Burndown REAL, do endpoint de relatórios do projeto da sprint. Antes esta
  // tela desenhava a curva "restante" interpolando uma reta do total até hoje —
  // uma linha bonita e inventada. O backend já calcula a entrega dia-a-dia por
  // `resolved_at` e por desfecho; usar isso é a diferença entre gráfico e enfeite.
  const { data: reports, isLoading: reportsLoading } = useProjectReports(
    activeSprint?.project_id ?? null,
  )
  const burndown = useMemo(() => toBurndownSeries(reports, today), [reports, today])

  // Minha fatia da sprint — o burndown acima é do time inteiro.
  const sprintMine = useMemo(() => {
    if (!activeSprint) return { cards: [], done: 0, total: 0, donePoints: 0 }
    const inSprint = my.mine.filter((c) => c.sprint_id === activeSprint.id)
    return {
      cards: inSprint,
      done: inSprint.filter(isDelivered).length,
      total: inSprint.reduce((s, c) => s + (c.points ?? 0), 0),
      donePoints: inSprint.filter(isDelivered).reduce((s, c) => s + (c.points ?? 0), 0),
    }
  }, [activeSprint, my.mine])

  const firstName = user?.full_name?.split(/\s+/)[0] ?? "você"
  // Atrasado primeiro: é o que muda a ordem do dia. Depois em andamento, revisão
  // e por fim a fila. Um Set evita repetir um card atrasado nas listas seguintes.
  const focusCards = useMemo(() => {
    const seen = new Set(my.overdue.map((c) => c.id))
    const rest = [...my.inProgress, ...my.review, ...my.todo].filter((c) => {
      if (seen.has(c.id)) return false
      seen.add(c.id)
      return true
    })
    return [...my.overdue, ...rest].slice(0, 6)
  }, [my.overdue, my.inProgress, my.review, my.todo])

  return (
    <div className="mx-auto w-full max-w-[1600px] pb-10">
      {/* Cabeçalho: data, saudação e o resumo do dia em uma frase. */}
      <header className="mb-6">
        <p className="text-[11px] font-semibold tracking-[0.18em] text-paper-400 dark:text-ink-500">
          {formatDateHeader()}
        </p>
        <h1 className="mt-1.5 text-[28px] font-bold leading-tight tracking-tight text-ink dark:text-paper">
          {greetingFor(new Date().getHours())},{" "}
          <span className="bg-gradient-to-r from-brand-400 to-violet-400 bg-clip-text text-transparent">
            {firstName}
          </span>
        </h1>
        {my.active.length > 0 ? (
          <p className="mt-1.5 text-sm text-paper-500 dark:text-ink-400">
            Você tem{" "}
            <span className="font-semibold text-ink dark:text-paper-300">
              {my.active.length} card{my.active.length > 1 ? "s" : ""} ativo{my.active.length > 1 ? "s" : ""}
            </span>{" "}
            e <span className="font-semibold text-ink dark:text-paper-300">{points} de peso</span>{" "}
            em aberto
            {activeSprint ? ` em ${activeSprint.name}` : ""}
            {my.overdue.length > 0 && (
              <>
                {" · "}
                <span className="font-semibold text-danger">
                  {my.overdue.length} atrasado{my.overdue.length > 1 ? "s" : ""}
                </span>
              </>
            )}
            .
          </p>
        ) : (
          <p className="mt-1.5 text-sm text-paper-500 dark:text-ink-400">
            Nenhum card ativo atribuído a você. Dia livre.
          </p>
        )}
      </header>

      {isLoading || sprintsLoading ? (
        <div className="grid place-items-center py-24">
          <Loader2 className="size-6 animate-spin text-paper-400" />
        </div>
      ) : (
        <motion.div variants={listVariants} initial="hidden" animate="show" className="space-y-4">
          {/* KPIs do dia. 5 itens: 1 col no mobile, 3 no tablet (sem órfão de
              meia largura como no 2-col antigo) e 5 na largura cheia. */}
          <motion.section
            variants={itemVariants}
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
          >
            <Stat icon={AlertTriangle} label="Atrasados" value={my.overdue.length} accent={my.overdue.length > 0 ? "text-danger" : undefined} tint="bg-danger/10 text-danger" />
            <Stat icon={CalendarClock} label="Vencem hoje" value={my.dueToday.length} accent={my.dueToday.length > 0 ? "text-warning" : undefined} tint="bg-warning/10 text-warning" />
            <Stat icon={RefreshCw} label="Em andamento" value={my.inProgress.length} tint="bg-sky-500/10 text-sky-500" />
            <Stat icon={Eye} label="Em revisão" value={my.review.length} tint="bg-amber-500/10 text-amber-500" />
            <Stat icon={Zap} label="Peso ativo" value={points} tint="bg-brand-500/10 text-brand-500" />
          </motion.section>

          {/*
            Duas colunas independentes, não uma grade de células.
            A grade antiga (xl:grid-cols-4, cada painel com col-span) forçava
            todos os painéis de uma linha à altura do mais alto: o burndown
            esticava ~300px além do gráfico para acompanhar a coluna lateral, e
            era isso que deixava a tela cheia de buracos brancos.
            `items-start` + duas pilhas próprias resolvem na raiz: cada painel
            tem a altura do seu conteúdo, e as colunas alinham no topo.
            Também há breakpoint em lg (1024) — antes só em xl (1280), então
            qualquer notebook via tudo empilhado em coluna única gigante.
          */}
          <div className="grid items-start gap-4 lg:grid-cols-12">
            <div className="space-y-4 lg:col-span-8">
              <motion.div variants={itemVariants}>
                <BurndownCard
                  data={burndown}
                  sprintName={reports?.burndown.sprint?.name ?? activeSprint?.name ?? null}
                  totalPoints={reports?.burndown.sprint?.total_points ?? 0}
                  loading={!!activeSprint && reportsLoading}
                  hasSprint={!!activeSprint}
                />
              </motion.div>

              <motion.div variants={itemVariants}>
                <FocusPanel cards={focusCards} />
              </motion.div>

              <div className="grid items-start gap-4 xl:grid-cols-2">
                <motion.div variants={itemVariants}>
                  <TodayAgenda
                    events={dayEvents ?? []}
                    connected={googleConnected}
                    loading={eventsLoading}
                  />
                </motion.div>
                <motion.div variants={itemVariants}>
                  <UpcomingWeek groups={upcoming} />
                </motion.div>
              </div>

              <motion.div variants={itemVariants}>
                <RecentActivity items={notifications ?? []} />
              </motion.div>
            </div>

            <aside className="space-y-4 lg:col-span-4">
              <motion.div variants={itemVariants}>
                <PulseIntelligence
                  points={points}
                  inProgressCount={my.inProgress.length}
                  overdueCount={my.overdue.length}
                  meetingsCount={dayEvents?.length ?? 0}
                />
              </motion.div>

              <motion.div variants={itemVariants}>
                <SprintPulse
                  sprint={activeSprint}
                  range={sprintRange}
                  cardCount={sprintMine.cards.length}
                  doneCount={sprintMine.done}
                  totalPoints={sprintMine.total}
                  donePoints={sprintMine.donePoints}
                />
              </motion.div>

              <motion.div variants={itemVariants}>
                <MiniPanel
                  title="A fazer"
                  icon={<CalendarCheck className="size-4 text-paper-500 dark:text-ink-400" />}
                  cards={my.todo}
                  empty="Fila limpa."
                />
              </motion.div>

              <motion.div variants={itemVariants}>
                <MiniPanel
                  title="Em revisão"
                  icon={<Sparkles className="size-4 text-warning" />}
                  cards={my.review}
                  empty="Nenhum card em revisão."
                />
              </motion.div>

              <motion.div variants={itemVariants}>
                <SalesFollowUpsPanel tasks={salesTasks ?? []} />
              </motion.div>

              <motion.div variants={itemVariants}>
                <MyTotals
                  assigned={my.mine.length}
                  delivered={my.delivered.length}
                  points={points}
                />
              </motion.div>
            </aside>
          </div>
        </motion.div>
      )}
    </div>
  )
}

/**
 * Série do burndown a partir do relatório do projeto.
 *
 * `ideal` cobre a sprint inteira; `actual` só vai até hoje. Casar por data (em
 * vez de por índice) mantém a linha real parando no dia certo mesmo se o backend
 * mudar a granularidade.
 */
export function toBurndownSeries(
  reports: ProjectReports | undefined,
  today: string,
): { date: string; isToday: boolean; ideal: number; real: number | null }[] {
  const b = reports?.burndown
  if (!b?.sprint || b.ideal.length === 0) return []
  const actual = new Map(b.actual.map((p) => [p.date, p.points]))
  return b.ideal.map((p) => ({
    date: p.date,
    isToday: p.date === today,
    ideal: p.points,
    real: actual.get(p.date) ?? null,
  }))
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
      <p className={cx("relative mt-3 text-[26px] font-bold leading-none tabular", accent)}>
        <CountUp value={value} />
      </p>
      <p className="relative mt-1.5 text-[12px] font-medium text-paper-500 dark:text-ink-400">{label}</p>
    </div>
  )
}

/** Cabeçalho padrão dos painéis — mesma altura e mesmo ritmo em todos. */
function PanelHead({
  icon: Icon,
  title,
  count,
  action,
}: {
  icon: LucideIcon
  title: string
  count?: number
  action?: { to: string; label: string }
}) {
  return (
    <div className="mb-4 flex h-6 items-center gap-2">
      <Icon className="size-4 shrink-0 text-brand-500" strokeWidth={2} />
      <h2 className="text-sm font-semibold text-ink dark:text-paper">{title}</h2>
      {count != null && count > 0 && (
        <span className="grid h-5 min-w-5 place-items-center rounded-full bg-paper-100 px-1.5 text-[11px] font-medium text-paper-600 dark:bg-ink-800 dark:text-paper-400">
          {count}
        </span>
      )}
      {action && (
        <Link
          to={action.to}
          className="ml-auto flex shrink-0 items-center gap-1 text-xs font-medium text-brand-500 transition-colors hover:text-brand-600 dark:hover:text-brand-400"
        >
          {action.label}
          <ExternalLink className="size-3" strokeWidth={2} />
        </Link>
      )}
    </div>
  )
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-paper-200 py-8 text-center text-sm text-paper-400 dark:border-ink-700">
      {children}
    </p>
  )
}

function BurndownCard({
  data,
  sprintName,
  totalPoints,
  loading,
  hasSprint,
}: {
  data: { date: string; isToday: boolean; ideal: number; real: number | null }[]
  sprintName: string | null
  totalPoints: number
  loading: boolean
  hasSprint: boolean
}) {
  // Restante de hoje = último ponto real que o backend mandou.
  const lastReal = [...data].reverse().find((d) => d.real != null)?.real ?? null
  const donePoints = lastReal != null ? Math.max(totalPoints - lastReal, 0) : 0
  const pct = totalPoints > 0 && lastReal != null ? Math.round((donePoints / totalPoints) * 100) : 0
  const todayIdx = data.findIndex((d) => d.isToday)

  return (
    <div className="surface p-5">
      <div className="mb-4 flex h-6 items-center gap-2">
        <TrendingDown className="size-4 shrink-0 text-brand-500" strokeWidth={2} />
        <h2 className="shrink-0 text-sm font-semibold text-ink dark:text-paper">Burndown da sprint</h2>
        {sprintName && (
          <span className="min-w-0 truncate text-xs text-paper-400">· {sprintName}</span>
        )}
        {data.length > 0 && (
          <span className="ml-auto shrink-0 rounded-full bg-brand-100 px-2.5 py-0.5 text-[11px] font-semibold text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
            {pct}% entregue
          </span>
        )}
      </div>

      {loading ? (
        <div className="grid h-64 place-items-center">
          <Loader2 className="size-5 animate-spin text-paper-400" />
        </div>
      ) : data.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-paper-200 text-center dark:border-ink-700">
          <TrendingDown className="mb-1 size-6 text-paper-300" />
          <p className="text-sm font-medium text-paper-500">
            {hasSprint ? "Sprint sem datas de início e fim" : "Nenhuma sprint ativa"}
          </p>
          <p className="text-xs text-paper-400">
            Inicie uma sprint com início/fim no backlog para ver o burndown aqui.
          </p>
        </div>
      ) : (
        <>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 5, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.15} />
                {todayIdx > 0 && (
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
              Nenhum ponto entregue ainda nesta sprint — a linha de restante só cai quando um card é
              concluído de fato.
            </p>
          )}
        </>
      )}
    </div>
  )
}

function FocusPanel({ cards }: { cards: BoardCard[] }) {
  return (
    <div className="surface lift p-5">
      <PanelHead
        icon={CircleDot}
        title="Seu foco agora"
        action={{ to: "/app/boards", label: "Ver no board" }}
      />
      {cards.length === 0 ? (
        <EmptyNote>Nenhum card atribuído a você.</EmptyNote>
      ) : (
        <motion.div
          variants={listVariants}
          initial="hidden"
          animate="show"
          className="flex flex-col divide-y divide-paper-100 dark:divide-ink-800"
        >
          {cards.map((c) => (
            <FocusCard key={c.id} card={c} />
          ))}
        </motion.div>
      )}
    </div>
  )
}

/**
 * Linha do foco em GRADE, não em flex.
 *
 * Com flex, cada chip tinha a largura do próprio texto: "Em progresso" e
 * "A fazer" começavam em x diferentes, o `peso` sumia quando o card não tinha
 * pontos e a coluna inteira ficava serrilhada. Colunas fixas fazem ref, prazo,
 * status e peso alinharem verticalmente linha a linha.
 * No mobile a grade cai para 3 colunas (barra, título, status) — as células
 * escondidas saem do fluxo, então a contagem continua batendo.
 */
function FocusCard({ card }: { card: BoardCard }) {
  const due = card.due_date?.slice(0, 10) ?? null
  const late = due != null && due < todayISO() && !isClosed(card)

  return (
    <motion.div
      variants={itemVariants}
      className="grid grid-cols-[3px_minmax(0,1fr)_104px] items-center gap-x-3 py-2.5 first:pt-0 last:pb-0 sm:grid-cols-[3px_62px_minmax(0,1fr)_92px_104px_58px]"
    >
      <span className={cx("h-8 w-[3px] rounded-full", PRIORITY_BAR[card.priority])} />

      <span className="hidden truncate font-mono text-[11px] tabular text-paper-400 sm:block">
        {card.ref}
      </span>

      <div className="min-w-0">
        <p className="truncate text-sm text-ink dark:text-paper">{card.title}</p>
        <p className="mt-0.5 truncate text-[11px] text-paper-400 dark:text-ink-500">
          {card.projectName}
        </p>
      </div>

      <div className="hidden justify-end sm:flex">
        {due && (
          <span
            className={cx(
              "flex items-center gap-1 truncate rounded-full px-2 py-0.5 text-[11px] font-semibold",
              late ? "bg-danger/10 text-danger" : "text-paper-400",
            )}
          >
            {late && <AlertTriangle className="size-3 shrink-0" strokeWidth={2.2} />}
            {relativeDayLabel(due)}
          </span>
        )}
      </div>

      <div className="flex justify-end">
        <span
          className={cx(
            "truncate rounded-full px-2 py-0.5 text-[11px] font-medium",
            STATUS_TONE[card.status],
          )}
        >
          {STATUS_LABEL[card.status]}
        </span>
      </div>

      <div className="hidden justify-end sm:flex">
        {card.points != null && card.points > 0 && (
          <span className="rounded-md bg-paper-100 px-1.5 py-0.5 text-[11px] font-medium tabular text-paper-500 dark:bg-ink-700 dark:text-paper-400">
            {card.points} pt
          </span>
        )}
      </div>
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
    <div className="surface p-4">
      <PanelHead icon={Target} title="Follow-ups comerciais" count={ordered.length} />
      <div className="flex flex-col gap-1.5">
        {ordered.slice(0, 4).map((t) => {
          const state = closeDateState(t.due_date)
          return (
            <Link
              key={t.id}
              to="/app/comercial"
              className="flex items-center gap-2 rounded-lg bg-paper-50 px-3 py-2 text-sm text-ink transition-colors hover:bg-paper-100 dark:bg-ink-800/60 dark:text-paper-200 dark:hover:bg-ink-800"
            >
              <span className="min-w-0 flex-1 truncate">
                {t.content}
                {t.deal_title && <span className="text-paper-400"> · {t.deal_title}</span>}
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
          <p className="rounded-xl border border-dashed border-paper-200 py-5 text-center text-xs text-paper-400 dark:border-ink-700">
            Nenhum follow-up pendente.
          </p>
        )}
        {ordered.length > 4 && (
          <p className="pt-0.5 text-center text-xs text-paper-400">+{ordered.length - 4} mais</p>
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
    <div className="surface p-4">
      <div className="mb-3 flex h-6 items-center gap-2">
        {icon}
        <h3 className="text-sm font-semibold text-ink dark:text-paper">{title}</h3>
        <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-paper-100 px-1.5 text-[11px] font-medium text-paper-600 dark:bg-ink-800 dark:text-paper-400">
          {cards.length}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {cards.slice(0, 4).map((c) => (
          <div
            key={c.id}
            className="truncate rounded-lg bg-paper-50 px-3 py-2 text-sm text-ink transition-colors hover:bg-paper-100 dark:bg-ink-800/60 dark:text-paper-200 dark:hover:bg-ink-800"
          >
            {c.title}
          </div>
        ))}
        {cards.length === 0 && (
          <p className="rounded-xl border border-dashed border-paper-200 py-5 text-center text-xs text-paper-400 dark:border-ink-700">
            {empty}
          </p>
        )}
        {cards.length > 4 && (
          <p className="pt-0.5 text-center text-xs text-paper-400">+{cards.length - 4} mais</p>
        )}
      </div>
    </div>
  )
}

/**
 * Totais acumulados — o contraponto dos KPIs do topo, que são só de hoje.
 *
 * O painel antigo repetia "em progresso" e "em revisão", que já estavam nos
 * KPIs a dois palmos de distância; ler o mesmo número duas vezes na mesma tela
 * é o que mais fazia ela parecer desorganizada. Aqui só o que não está lá.
 */
function MyTotals({
  assigned,
  delivered,
  points,
}: {
  assigned: number
  delivered: number
  points: number
}) {
  const pct = assigned > 0 ? Math.round((delivered / assigned) * 100) : 0
  return (
    <div className="surface space-y-3 p-4">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-paper-400 dark:text-ink-500">
        Meus totais
      </h3>
      <div className="flex flex-col gap-2.5">
        <StatRow label="Cards atribuídos" value={assigned} />
        <StatRow label="Entregues" value={delivered} highlight />
        <StatRow label="Peso em aberto" value={points} />
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-paper-100 dark:bg-ink-800">
        <motion.div
          className="h-full rounded-full bg-green-500"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
      <p className="text-[11px] text-paper-400">{pct}% do que é seu já foi entregue</p>
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
        <div className="mb-3 flex h-6 items-center gap-2">
          <Zap className="size-4" strokeWidth={2.2} />
          <span className="text-sm font-semibold">Pulse Intelligence</span>
        </div>
        <p className="text-[13px] leading-relaxed text-white/90">{message}</p>
      </div>
    </div>
  )
}

/**
 * Minha fatia da sprint em números que cabem numa olhada: quanto falta, quanto
 * tempo resta e qual ritmo diário fecha o meu lote. O burndown ao lado é do time
 * inteiro — aqui só entram cards atribuídos a mim.
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
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-paper-400 dark:text-ink-500">
          Sprint
        </h3>
        <p className="mt-3 text-sm text-paper-500 dark:text-ink-400">Nenhuma sprint ativa.</p>
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
    <div className="surface space-y-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-paper-400 dark:text-ink-500">
            Minha carga na sprint
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
            <span className="font-semibold tabular text-ink dark:text-paper">{donePoints}</span>
            <span className="text-paper-400"> / {totalPoints} pts</span>
          </span>
          <span className={cx("font-semibold tabular", ahead ? "text-green-500" : "text-warning")}>
            {pct}%
          </span>
        </div>
        <div className="relative h-2 overflow-hidden rounded-full bg-paper-100 dark:bg-ink-800">
          <motion.div
            className={cx("h-full rounded-full", ahead ? "bg-green-500" : "bg-brand-500")}
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
        <StatRow label="Cards na sprint" value={cardCount} />
        <StatRow label="Entregues" value={doneCount} highlight />
        <StatRow label="Pontos restantes" value={remainingPoints} />
      </div>

      {remainingPoints > 0 && (
        <p className="flex items-center gap-1.5 rounded-lg bg-paper-50 px-2.5 py-2 text-[11px] text-paper-500 dark:bg-ink-800/60 dark:text-ink-400">
          <Flame className={cx("size-3.5 shrink-0", ahead ? "text-green-500" : "text-warning")} />
          Ritmo necessário:{" "}
          <span className="font-semibold tabular text-ink dark:text-paper">
            {pace.toFixed(1)} pts/dia
          </span>
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
  const ordered = useMemo(() => [...events].sort((a, b) => a.start.localeCompare(b.start)), [events])
  const next = ordered.find((e) => !e.all_day && new Date(e.end).getTime() > now)

  return (
    <div className="surface lift p-5">
      <PanelHead
        icon={CalendarDays}
        title="Agenda de hoje"
        count={connected ? ordered.length : undefined}
        action={{ to: "/app/integrations", label: "Calendário" }}
      />

      {!connected ? (
        <div className="rounded-xl border border-dashed border-paper-200 py-8 text-center dark:border-ink-700">
          <p className="text-sm text-paper-500">Google Agenda não conectado</p>
          <Link
            to="/app/integrations"
            className="mt-1 inline-block text-xs font-medium text-brand-500 hover:text-brand-600"
          >
            Conectar para ver suas reuniões aqui
          </Link>
        </div>
      ) : loading ? (
        <div className="grid place-items-center py-10">
          <Loader2 className="size-5 animate-spin text-paper-400" />
        </div>
      ) : ordered.length === 0 ? (
        <EmptyNote>Nenhuma reunião hoje. Dia livre para executar.</EmptyNote>
      ) : (
        <div className="flex flex-col divide-y divide-paper-100 dark:divide-ink-800">
          {ordered.slice(0, 5).map((e) => {
            const isNext = e.event_id === next?.event_id
            const past = !e.all_day && new Date(e.end).getTime() < now
            return (
              <div
                key={e.event_id}
                className={cx(
                  "grid grid-cols-[78px_3px_minmax(0,1fr)_auto] items-center gap-x-3 py-2.5 first:pt-0 last:pb-0",
                  past && "opacity-50",
                )}
              >
                <span className="font-mono text-[11px] tabular text-paper-500 dark:text-ink-400">
                  {e.all_day ? "dia todo" : `${fmtHour(e.start)}–${fmtHour(e.end)}`}
                </span>
                <span
                  className={cx(
                    "h-7 w-[3px] rounded-full",
                    isNext ? "bg-brand-500" : "bg-paper-200 dark:bg-ink-700",
                  )}
                />
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink dark:text-paper">{e.title}</p>
                  <p className="mt-0.5 truncate text-[11px] text-paper-400">
                    {isNext && <span className="font-semibold text-brand-500">Próxima · </span>}
                    {e.attendees.length > 0
                      ? `${e.attendees.length} participante${e.attendees.length > 1 ? "s" : ""}`
                      : "Sem convidados"}
                  </p>
                </div>
                {e.meet_link ? (
                  <a
                    href={e.meet_link}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 rounded-lg bg-paper-50 px-2 py-1 text-[11px] font-medium text-brand-500 transition-colors hover:bg-paper-100 dark:bg-ink-800 dark:hover:bg-ink-700"
                  >
                    <Video className="size-3" strokeWidth={2} />
                    Entrar
                  </a>
                ) : (
                  <span />
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
  const total = groups.reduce((s, [, cs]) => s + cs.length, 0)
  return (
    <div className="surface lift p-5">
      <PanelHead icon={CalendarCheck} title="Próximos 7 dias" count={total} />

      {groups.length === 0 ? (
        <EmptyNote>Nenhum prazo na próxima semana.</EmptyNote>
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
                    className="grid grid-cols-[3px_minmax(0,1fr)_92px] items-center gap-x-2 rounded-lg bg-paper-50 px-3 py-2 dark:bg-ink-800/60 sm:grid-cols-[3px_58px_minmax(0,1fr)_92px]"
                  >
                    <span className={cx("h-5 w-[3px] rounded-full", PRIORITY_BAR[c.priority])} />
                    <span className="hidden truncate font-mono text-[11px] tabular text-paper-400 sm:block">
                      {c.ref}
                    </span>
                    <span className="truncate text-sm text-ink dark:text-paper-200">{c.title}</span>
                    <span className="flex justify-end">
                      <span
                        className={cx(
                          "truncate rounded-full px-2 py-0.5 text-[10px] font-medium",
                          STATUS_TONE[c.status],
                        )}
                      >
                        {STATUS_LABEL[c.status]}
                      </span>
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
    <div className="surface lift p-5">
      <div className="mb-4 flex h-6 items-center gap-2">
        <Activity className="size-4 shrink-0 text-brand-500" strokeWidth={2} />
        <h2 className="text-sm font-semibold text-ink dark:text-paper">Atividade recente</h2>
        {unread > 0 && (
          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-brand-500 px-1.5 text-[11px] font-semibold text-white">
            {unread}
          </span>
        )}
      </div>

      {ordered.length === 0 ? (
        <EmptyNote>Nada novo por aqui.</EmptyNote>
      ) : (
        <div className="grid gap-2 md:grid-cols-2">
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
                  NOTIF_ICON_TONE[n.type] ??
                    "bg-paper-200/60 text-paper-500 dark:bg-ink-700 dark:text-paper-400",
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

function StatRow({
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
