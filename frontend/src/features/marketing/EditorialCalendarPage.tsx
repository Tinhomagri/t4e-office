// Calendário editorial — a agenda de conteúdo do workspace.
//
// Três leituras da mesma fila: mês (volume e buracos de cadência), semana
// (rotina do time) e lista (execução, ordenada por horário). Arrastar um post
// entre dias reagenda de verdade — a mesma operação que o drawer faz pelo
// formulário.
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Eye,
  List,
  Plus,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react"
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react"

import { CHANNEL_COLOR, CHANNEL_LABEL } from "@/features/boards/views/CalendarioView"
import { listSocialAccounts, type SocialAccount } from "@/features/copilot/copilot.api"
import {
  deletePost,
  listPosts,
  publishPost,
  schedulePost,
  updatePost,
  type ScheduledPost,
} from "@/features/integrations/social.api"
import { useWorkspaceStore } from "@/features/workspace/workspace.store"
import { EASE, liftCard } from "@/shared/lib/motion"
import {
  type CommandAction,
  FilterChip,
  MOD_LABEL,
  MetricStrip,
  MetricTile,
  Panel,
  SearchField,
  SegmentedControl,
  Toolbar,
  compactNumber,
  useCommandPalette,
  useHotkey,
  usePersistedState,
} from "@/shared/ui/command-center"
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  Kbd,
  Modal,
  PageHeader,
  Textarea,
  cx,
} from "@/shared/ui/primitives"
import { toast } from "@/shared/ui/toast"

type CalendarView = "month" | "week" | "list"
type StatusKey = ScheduledPost["status"]

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]
const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]

const STATUS_DOT: Record<StatusKey, string> = {
  draft: "bg-paper-400",
  scheduled: "bg-brand-500",
  published: "bg-success",
  failed: "bg-danger",
}

const STATUS_LABEL: Record<StatusKey, string> = {
  draft: "Rascunho",
  scheduled: "Na fila",
  published: "Publicado",
  failed: "Falhou",
}

const STATUS_TONE: Record<StatusKey, "neutral" | "brand" | "success" | "danger"> = {
  draft: "neutral",
  scheduled: "brand",
  published: "success",
  failed: "danger",
}

/** Chave local YYYY-MM-DD — evita o deslocamento de fuso do toISOString(). */
function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`
}

function postDayKey(post: ScheduledPost): string {
  return dayKey(new Date(post.scheduled_at))
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
}

/** Mantém a hora original e troca só a data — arrastar não deve mexer no horário. */
function moveToDay(iso: string, targetKey: string): string {
  const [y, m, d] = targetKey.split("-").map(Number)
  const moved = new Date(iso)
  moved.setFullYear(y, m - 1, d)
  return moved.toISOString()
}

// ── Célula de dia (drop target) ──────────────────────────────────────────────
function DayCell({
  id,
  children,
  className,
  onClick,
}: {
  id: string
  children: ReactNode
  className?: string
  onClick?: () => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div
      ref={setNodeRef}
      onClick={onClick}
      className={cx(
        "transition-colors duration-150",
        isOver && "bg-brand-50 ring-1 ring-inset ring-brand-300 dark:bg-brand-900/30",
        className,
      )}
    >
      {children}
    </div>
  )
}

// ── Chip do post (draggable) ─────────────────────────────────────────────────
function PostChip({
  post,
  onOpen,
  draggable,
}: {
  post: ScheduledPost
  onOpen: () => void
  draggable: boolean
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: post.id,
    disabled: !draggable,
  })
  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={(e) => {
        e.stopPropagation()
        onOpen()
      }}
      title={`${fmtTime(post.scheduled_at)} · ${post.content}`}
      className={cx(
        "flex w-full items-center gap-1 rounded px-1.5 py-0.5 text-left text-[10px] font-medium transition-opacity duration-100 focus-ring",
        CHANNEL_COLOR[post.channel] ?? "bg-paper-200 text-paper-600",
        post.status === "published" && "opacity-60",
        isDragging && "opacity-30",
        draggable && "cursor-grab active:cursor-grabbing",
      )}
    >
      <span className={cx("size-1.5 shrink-0 rounded-full", STATUS_DOT[post.status])} />
      <span className="shrink-0 tabular">{fmtTime(post.scheduled_at)}</span>
      <span className="truncate">{post.content || "—"}</span>
    </button>
  )
}

export function EditorialCalendarPage() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const reduce = useReducedMotion()
  const today = new Date()

  const [cursor, setCursor] = useState(() => new Date())
  const [view, setView] = usePersistedState<CalendarView>("editorial:view", "month")
  const [posts, setPosts] = useState<ScheduledPost[]>([])
  const [accounts, setAccounts] = useState<SocialAccount[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<ScheduledPost | null>(null)
  const [dragging, setDragging] = useState<ScheduledPost | null>(null)
  const [query, setQuery] = useState("")
  const [channelFilter, setChannelFilter] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = usePersistedState<StatusKey[]>("editorial:statuses", [
    "draft",
    "scheduled",
    "published",
    "failed",
  ])
  const [composerDay, setComposerDay] = useState<string | null>(null)

  const sensors = useSensors(
    // 6px de tolerância: clique no chip abre o drawer; arrasto só a partir daí.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )

  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`

  const load = useCallback(() => {
    if (!workspaceId) return
    setLoading(true)
    // A semana pode cruzar a virada do mês: buscamos o mês do cursor e o
    // seguinte, e filtramos em memória.
    const neighbour = new Date(year, month + 1, 1)
    const neighbourKey = `${neighbour.getFullYear()}-${String(
      neighbour.getMonth() + 1,
    ).padStart(2, "0")}`
    Promise.all([
      listPosts(workspaceId, { month: monthKey }),
      listPosts(workspaceId, { month: neighbourKey }),
    ])
      .then(([current, next]) => {
        const seen = new Set<string>()
        setPosts(
          [...current, ...next].filter((p) => {
            if (seen.has(p.id)) return false
            seen.add(p.id)
            return true
          }),
        )
      })
      .catch(() => toast.error("Falha ao carregar posts do período."))
      .finally(() => setLoading(false))
  }, [workspaceId, monthKey, year, month])

  useEffect(() => {
    load()
    setSelected(null)
  }, [load])

  useEffect(() => {
    if (!workspaceId) return
    void listSocialAccounts(workspaceId)
      .then((r) => setAccounts(r.accounts))
      .catch(() => setAccounts([]))
  }, [workspaceId])

  const shiftPeriod = useCallback(
    (delta: number) => {
      setCursor((prev) =>
        view === "week"
          ? new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + delta * 7)
          : new Date(prev.getFullYear(), prev.getMonth() + delta, 1),
      )
    },
    [view],
  )

  const goToday = useCallback(() => setCursor(new Date()), [])

  useHotkey("mod+r", load)
  useHotkey("escape", () => setSelected(null), { enabled: !!selected })

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true)
    try {
      await fn()
      toast.success(ok)
      setSelected(null)
      load()
    } catch {
      toast.error("Ação falhou.")
    } finally {
      setBusy(false)
    }
  }

  // ── Filtros ───────────────────────────────────────────────────────────────
  const channels = useMemo(() => Array.from(new Set(posts.map((p) => p.channel))).sort(), [posts])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return posts.filter((p) => {
      if (!statusFilter.includes(p.status)) return false
      if (channelFilter && p.channel !== channelFilter) return false
      if (!q) return true
      return (
        p.content.toLowerCase().includes(q) ||
        p.account_name.toLowerCase().includes(q) ||
        (CHANNEL_LABEL[p.channel] ?? p.channel).toLowerCase().includes(q)
      )
    })
  }, [posts, statusFilter, channelFilter, query])

  const byDay = useMemo(() => {
    const map = new Map<string, ScheduledPost[]>()
    for (const post of visible) {
      const key = postDayKey(post)
      const bucket = map.get(key)
      if (bucket) bucket.push(post)
      else map.set(key, [post])
    }
    for (const bucket of map.values()) {
      bucket.sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
    }
    return map
  }, [visible])

  // ── Grades ────────────────────────────────────────────────────────────────
  const monthCells = useMemo<(Date | null)[]>(() => {
    const firstWeekday = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    return [
      ...Array.from({ length: firstWeekday }, () => null),
      ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
    ]
  }, [year, month])

  const weekDays = useMemo(() => {
    const start = new Date(cursor)
    start.setDate(start.getDate() - start.getDay())
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      return d
    })
  }, [cursor])

  const listItems = useMemo(
    () =>
      visible
        .filter((p) => p.scheduled_at.slice(0, 7) === monthKey)
        .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at)),
    [visible, monthKey],
  )

  // ── Métricas do mês ───────────────────────────────────────────────────────
  const monthPosts = useMemo(
    () => posts.filter((p) => p.scheduled_at.slice(0, 7) === monthKey),
    [posts, monthKey],
  )

  const summary = useMemo(() => {
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const counts = new Map<string, number>()
    for (const post of monthPosts) {
      const key = postDayKey(post)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    const perDay = Array.from({ length: daysInMonth }, (_, i) =>
      counts.get(dayKey(new Date(year, month, i + 1))) ?? 0,
    )
    return {
      total: monthPosts.length,
      published: monthPosts.filter((p) => p.status === "published").length,
      scheduled: monthPosts.filter((p) => p.status === "scheduled").length,
      failed: monthPosts.filter((p) => p.status === "failed").length,
      impressions: monthPosts.reduce((acc, p) => acc + (p.metrics?.impressions ?? 0), 0),
      emptyDays: perDay.filter((n) => n === 0).length,
      perDay,
    }
  }, [monthPosts, year, month])

  // ── Drag & drop ───────────────────────────────────────────────────────────
  const onDragStart = (event: DragStartEvent) =>
    setDragging(posts.find((p) => p.id === event.active.id) ?? null)

  const onDragEnd = async (event: DragEndEvent) => {
    const post = dragging
    setDragging(null)
    const targetKey = event.over?.id
    if (!post || typeof targetKey !== "string" || postDayKey(post) === targetKey) return

    const nextIso = moveToDay(post.scheduled_at, targetKey)
    // Otimista: a grade já mostra o post no dia novo enquanto o PATCH sobe.
    setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, scheduled_at: nextIso } : p)))
    try {
      await updatePost(post.id, { scheduled_at: nextIso })
      toast.success(`Reagendado para ${new Date(nextIso).toLocaleDateString("pt-BR")}.`)
    } catch {
      toast.error("Falha ao reagendar.")
      setPosts((prev) => prev.map((p) => (p.id === post.id ? post : p)))
    }
  }

  const duplicate = async (post: ScheduledPost) => {
    const account = accounts.find((a) => a.channel === post.channel)
    if (!workspaceId || !account) {
      toast.error("Conta do canal não está conectada.")
      return
    }
    const next = new Date(post.scheduled_at)
    next.setDate(next.getDate() + 7)
    await act(
      () =>
        schedulePost({
          workspaceId,
          accountId: account.id,
          content: post.content,
          scheduledAt: next.toISOString(),
          mediaUrl: post.media_url,
          mediaUrls: post.media_urls,
          mentions: post.mentions,
        }),
      "Post duplicado para a semana seguinte.",
    )
  }

  const actions = useMemo<CommandAction[]>(
    () => [
      {
        id: "new",
        label: "Agendar novo post",
        icon: <Plus className="size-4" />,
        run: () => setComposerDay(dayKey(new Date())),
      },
      { id: "today", label: "Ir para hoje", icon: <CalendarDays className="size-4" />, run: goToday },
      {
        id: "prev",
        label: "Período anterior",
        icon: <ChevronLeft className="size-4" />,
        run: () => shiftPeriod(-1),
      },
      {
        id: "next",
        label: "Próximo período",
        icon: <ChevronRight className="size-4" />,
        run: () => shiftPeriod(1),
      },
      {
        id: "view-month",
        label: "Visão: mês",
        group: "Visão",
        icon: <CalendarDays className="size-4" />,
        run: () => setView("month"),
      },
      {
        id: "view-week",
        label: "Visão: semana",
        group: "Visão",
        icon: <CalendarDays className="size-4" />,
        run: () => setView("week"),
      },
      {
        id: "view-list",
        label: "Visão: lista",
        group: "Visão",
        icon: <List className="size-4" />,
        run: () => setView("list"),
      },
      {
        id: "only-scheduled",
        label: "Filtrar só o que está na fila",
        icon: <Clock className="size-4" />,
        run: () => setStatusFilter(["scheduled"]),
      },
      {
        id: "all-status",
        label: "Mostrar todos os status",
        icon: <Eye className="size-4" />,
        run: () => setStatusFilter(["draft", "scheduled", "published", "failed"]),
      },
    ],
    [goToday, shiftPeriod, setView, setStatusFilter],
  )

  const { palette, setOpen } = useCommandPalette(actions)

  const periodLabel =
    view === "week"
      ? `${weekDays[0].toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} – ${weekDays[6].toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`
      : `${MONTHS[month]} ${year}`

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4 p-4 sm:p-6">
      {palette}

      <PageHeader
        eyebrow="Marketing"
        title="Calendário editorial"
        subtitle="Arraste um post para reagendar; clique num dia para criar."
      >
        <Button
          variant="outline"
          size="sm"
          icon={<Sparkles className="size-3.5" />}
          onClick={() => setOpen(true)}
        >
          Comandos <Kbd>{MOD_LABEL}K</Kbd>
        </Button>
        <Button
          size="sm"
          icon={<Plus className="size-3.5" />}
          onClick={() => setComposerDay(dayKey(new Date()))}
        >
          Novo post
        </Button>
      </PageHeader>

      {!workspaceId ? (
        <EmptyState
          title="Selecione um workspace"
          description="O calendário editorial é organizado por workspace."
        />
      ) : (
        <>
          <MetricStrip>
            <MetricTile
              label="Posts no mês"
              value={String(summary.total)}
              rawValue={summary.total}
              spark={summary.perDay}
              icon={<CalendarDays className="size-3.5" />}
            />
            <MetricTile
              label="Publicados"
              value={String(summary.published)}
              rawValue={summary.published}
              tone="success"
              icon={<CheckCircle2 className="size-3.5" />}
            />
            <MetricTile
              label="Na fila"
              value={String(summary.scheduled)}
              rawValue={summary.scheduled}
              tone="brand"
              icon={<Clock className="size-3.5" />}
            />
            <MetricTile
              label="Falhas"
              value={String(summary.failed)}
              rawValue={summary.failed}
              tone={summary.failed > 0 ? "danger" : "neutral"}
              icon={<AlertTriangle className="size-3.5" />}
            />
            <MetricTile
              label="Dias sem post"
              value={String(summary.emptyDays)}
              rawValue={summary.emptyDays}
              tone={summary.emptyDays > 15 ? "warning" : "neutral"}
              icon={<CalendarDays className="size-3.5" />}
              hint="Buracos na cadência do mês"
            />
            <MetricTile
              label="Impressões"
              value={compactNumber(summary.impressions)}
              rawValue={summary.impressions}
              icon={<Eye className="size-3.5" />}
            />
          </MetricStrip>

          <Toolbar>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => shiftPeriod(-1)}
                aria-label="Período anterior"
                icon={<ChevronLeft className="size-4" />}
              />
              <span className="min-w-[9rem] text-center text-[13px] font-semibold text-ink dark:text-paper">
                {periodLabel}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => shiftPeriod(1)}
                aria-label="Próximo período"
                icon={<ChevronRight className="size-4" />}
              />
              <Button variant="outline" size="sm" onClick={goToday}>
                Hoje
              </Button>
            </div>

            <SegmentedControl
              layoutId="editorial-view"
              size="sm"
              ariaLabel="Visão do calendário"
              value={view}
              onChange={setView}
              options={[
                { value: "month", label: "Mês" },
                { value: "week", label: "Semana" },
                { value: "list", label: "Lista" },
              ]}
            />

            <SearchField
              value={query}
              onChange={setQuery}
              placeholder="Buscar post…"
              className="min-w-[180px]"
            />

            <div className="flex flex-wrap items-center gap-1.5">
              {(Object.keys(STATUS_LABEL) as StatusKey[]).map((status) => (
                <FilterChip
                  key={status}
                  label={STATUS_LABEL[status]}
                  dotClass={STATUS_DOT[status]}
                  active={statusFilter.includes(status)}
                  onClick={() =>
                    setStatusFilter((prev) =>
                      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status],
                    )
                  }
                />
              ))}
            </div>

            {channels.length > 1 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {channels.map((ch) => (
                  <FilterChip
                    key={ch}
                    label={CHANNEL_LABEL[ch] ?? ch}
                    active={channelFilter === ch}
                    onClick={() => setChannelFilter((c) => (c === ch ? null : ch))}
                  />
                ))}
              </div>
            )}
          </Toolbar>

          <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
            {view === "list" ? (
              <Panel
                title="Agenda do mês"
                subtitle={`${listItems.length} post${listItems.length === 1 ? "" : "s"}`}
                bodyClassName="divide-y divide-paper-200 dark:divide-ink-700"
              >
                {listItems.length === 0 ? (
                  <EmptyState
                    title="Nada agendado no mês"
                    description="Crie um post ou ajuste os filtros."
                    className="border-0 bg-transparent"
                    action={
                      <Button size="sm" onClick={() => setComposerDay(dayKey(new Date()))}>
                        Agendar post
                      </Button>
                    }
                  />
                ) : (
                  listItems.map((post) => (
                    <button
                      key={post.id}
                      type="button"
                      onClick={() => setSelected(post)}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors duration-150 hover:bg-paper-50 focus-ring dark:hover:bg-ink-800"
                    >
                      <span className="w-24 shrink-0">
                        <span className="block text-[13px] font-semibold tabular text-ink dark:text-paper">
                          {new Date(post.scheduled_at).toLocaleDateString("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                          })}
                        </span>
                        <span className="block text-[11px] tabular text-paper-400">
                          {fmtTime(post.scheduled_at)}
                        </span>
                      </span>
                      <span
                        className={cx(
                          "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
                          CHANNEL_COLOR[post.channel] ?? "bg-paper-200 text-paper-600",
                        )}
                      >
                        {CHANNEL_LABEL[post.channel] ?? post.channel}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13px] text-ink dark:text-paper">
                        {post.content || "—"}
                      </span>
                      <Badge tone={STATUS_TONE[post.status]}>{STATUS_LABEL[post.status]}</Badge>
                    </button>
                  ))
                )}
              </Panel>
            ) : (
              <Panel bodyClassName="overflow-hidden">
                <div className="grid grid-cols-7 border-b border-paper-200 bg-paper-50 dark:border-ink-700 dark:bg-ink-900">
                  {(view === "week" ? weekDays : WEEKDAYS).map((item, i) => (
                    <div
                      key={i}
                      className="px-2 py-1.5 text-center text-[10px] font-bold uppercase tracking-widest text-paper-500"
                    >
                      {typeof item === "string"
                        ? item
                        : `${WEEKDAYS[item.getDay()]} ${item.getDate()}`}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-7">
                  {(view === "week" ? weekDays : monthCells).map((date, i) => {
                    if (date === null) {
                      return (
                        <div
                          key={`empty-${i}`}
                          className="min-h-24 border-b border-r border-paper-100 bg-paper-50/60 dark:border-ink-800 dark:bg-ink-950/40"
                        />
                      )
                    }
                    const key = dayKey(date)
                    const items = byDay.get(key) ?? []
                    const isToday = key === dayKey(today)
                    const isWeekend = date.getDay() === 0 || date.getDay() === 6
                    return (
                      <DayCell
                        key={key}
                        id={key}
                        onClick={() => setComposerDay(key)}
                        className={cx(
                          "group/day min-h-24 cursor-pointer border-b border-r border-paper-100 p-1 dark:border-ink-800",
                          view === "week" && "min-h-[22rem]",
                          isWeekend && "bg-paper-50/50 dark:bg-ink-950/20",
                        )}
                      >
                        <div className="mb-1 flex items-center justify-between px-0.5">
                          <span
                            className={cx(
                              "grid size-5 place-items-center rounded-full text-[11px] tabular",
                              isToday ? "bg-brand-500 font-semibold text-white" : "text-paper-400",
                            )}
                          >
                            {date.getDate()}
                          </span>
                          <span className="flex items-center gap-1">
                            {items.length > 0 && (
                              <span className="text-[10px] tabular text-paper-400">
                                {items.length}
                              </span>
                            )}
                            <Plus
                              className="size-3 text-paper-300 opacity-0 transition-opacity duration-150 group-hover/day:opacity-100"
                              aria-hidden="true"
                            />
                          </span>
                        </div>
                        <div className="space-y-0.5">
                          {(view === "week" ? items : items.slice(0, 4)).map((post) => (
                            <PostChip
                              key={post.id}
                              post={post}
                              draggable={post.status !== "published"}
                              onOpen={() => setSelected(post)}
                            />
                          ))}
                          {view === "month" && items.length > 4 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setCursor(date)
                                setView("week")
                              }}
                              className="w-full rounded px-1.5 py-0.5 text-left text-[10px] text-paper-500 hover:bg-paper-100 focus-ring dark:hover:bg-ink-800"
                            >
                              +{items.length - 4} no dia
                            </button>
                          )}
                        </div>
                      </DayCell>
                    )
                  })}
                </div>
              </Panel>
            )}

            <DragOverlay dropAnimation={reduce ? null : undefined}>
              {dragging && (
                <motion.div
                  initial={{ scale: 1 }}
                  animate={{ scale: 1.04, rotate: -1.5 }}
                  transition={liftCard}
                  className={cx(
                    "rounded px-1.5 py-0.5 text-[10px] font-medium shadow-pop",
                    CHANNEL_COLOR[dragging.channel] ?? "bg-paper-200 text-paper-600",
                  )}
                >
                  {fmtTime(dragging.scheduled_at)} · {dragging.content || "—"}
                </motion.div>
              )}
            </DragOverlay>
          </DndContext>

          {loading && <p className="text-[12px] text-paper-500">Carregando posts…</p>}
        </>
      )}

      {/* Drawer de detalhe do post */}
      <AnimatePresence>
        {selected && (
          <>
            <motion.div
              key="scrim"
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-40 bg-ink-950/30"
              onClick={() => setSelected(null)}
            />
            <motion.aside
              key="drawer"
              role="dialog"
              aria-label="Detalhes do post"
              initial={reduce ? false : { x: 24, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.12 } }}
              transition={{ duration: 0.2, ease: EASE }}
              className="fixed right-0 top-0 z-50 flex h-full w-full max-w-sm flex-col border-l border-paper-200 bg-paper shadow-pop dark:border-ink-700 dark:bg-ink-900"
            >
              <header className="flex items-start justify-between gap-3 border-b border-paper-200 px-4 py-3 dark:border-ink-700">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-ink dark:text-paper">
                    {CHANNEL_LABEL[selected.channel] ?? selected.channel}
                  </p>
                  <p className="truncate text-[11px] text-paper-500">{selected.account_name}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  aria-label="Fechar"
                  className="grid size-7 place-items-center rounded-md text-paper-400 transition-colors hover:bg-paper-100 hover:text-ink focus-ring dark:hover:bg-ink-800 dark:hover:text-paper"
                >
                  <X className="size-4" />
                </button>
              </header>

              <div className="flex-1 space-y-4 overflow-y-auto p-4 scrollbar-slim">
                <div className="flex items-center gap-2">
                  <Badge tone={STATUS_TONE[selected.status]}>{STATUS_LABEL[selected.status]}</Badge>
                  <span className="text-[12px] tabular text-paper-500">
                    {new Date(selected.scheduled_at).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>

                {/* Preview aproximando o formato do feed. */}
                <div className="rounded-lg border border-paper-200 p-3 dark:border-ink-700">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="grid size-7 place-items-center rounded-full bg-paper-100 text-[11px] font-semibold text-paper-600 dark:bg-ink-800">
                      {selected.account_name.slice(0, 2).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[12px] font-medium text-ink dark:text-paper">
                        {selected.account_name}
                      </p>
                      <p className="text-[10px] text-paper-400">
                        {CHANNEL_LABEL[selected.channel] ?? selected.channel}
                      </p>
                    </div>
                  </div>
                  <p className="whitespace-pre-wrap text-[13px] text-ink dark:text-paper">
                    {selected.content || "—"}
                  </p>
                  {(selected.media_urls?.length ?? 0) > 0 && (
                    <div className="mt-2 grid grid-cols-3 gap-1">
                      {selected.media_urls.slice(0, 3).map((url) => (
                        <img
                          key={url}
                          src={url}
                          alt=""
                          loading="lazy"
                          className="aspect-square w-full rounded object-cover"
                        />
                      ))}
                    </div>
                  )}
                  {selected.mentions?.length > 0 && (
                    <p className="mt-2 text-[11px] text-brand-600 dark:text-brand-300">
                      {selected.mentions.map((m) => `@${m}`).join(" ")}
                    </p>
                  )}
                </div>

                {selected.status === "published" && selected.metrics && (
                  <div className="grid grid-cols-3 gap-2 text-center">
                    {(
                      [
                        ["Impressões", selected.metrics.impressions],
                        ["Curtidas", selected.metrics.likes],
                        ["Cliques", selected.metrics.clicks],
                      ] as const
                    ).map(([label, value]) => (
                      <div key={label} className="rounded-md bg-paper-50 py-2 dark:bg-ink-800">
                        <p className="text-sm font-semibold tabular text-ink dark:text-paper">
                          {compactNumber(value)}
                        </p>
                        <p className="text-[10px] uppercase tracking-wide text-paper-500">{label}</p>
                      </div>
                    ))}
                  </div>
                )}

                {selected.status === "failed" && selected.error && (
                  <p className="rounded-md bg-danger/10 px-2.5 py-2 text-[12px] text-danger">
                    {selected.error}
                  </p>
                )}

                {selected.status !== "published" && (
                  <Field label="Reagendar">
                    <Input
                      type="datetime-local"
                      defaultValue={selected.scheduled_at.slice(0, 16)}
                      disabled={busy}
                      onChange={(e) => {
                        if (!e.target.value) return
                        void act(
                          () =>
                            updatePost(selected.id, {
                              scheduled_at: new Date(e.target.value).toISOString(),
                            }),
                          "Post reagendado.",
                        )
                      }}
                    />
                  </Field>
                )}
              </div>

              <footer className="flex flex-wrap items-center gap-2 border-t border-paper-200 p-3 dark:border-ink-700">
                {selected.status !== "published" && (
                  <Button
                    size="sm"
                    icon={<Send className="size-3.5" />}
                    loading={busy}
                    onClick={() => void act(() => publishPost(selected.id), "Post publicado.")}
                  >
                    Publicar agora
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  icon={<Copy className="size-3.5" />}
                  loading={busy}
                  onClick={() => void duplicate(selected)}
                >
                  Duplicar +7d
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto text-danger"
                  icon={<Trash2 className="size-3.5" />}
                  loading={busy}
                  onClick={() => void act(() => deletePost(selected.id), "Post excluído.")}
                >
                  Excluir
                </Button>
              </footer>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <ComposerModal
        open={composerDay !== null}
        day={composerDay}
        accounts={accounts}
        workspaceId={workspaceId}
        onClose={() => setComposerDay(null)}
        onSaved={() => {
          setComposerDay(null)
          load()
        }}
      />
    </div>
  )
}

// ── Composer ─────────────────────────────────────────────────────────────────
// Limites de caracteres por rede — o contador vira vermelho antes do envio,
// evitando a rejeição só na hora da publicação.
const CHANNEL_LIMIT: Record<string, number> = {
  x: 280,
  instagram: 2200,
  facebook: 5000,
  linkedin: 3000,
  tiktok: 2200,
  youtube: 5000,
}

function ComposerModal({
  open,
  day,
  accounts,
  workspaceId,
  onClose,
  onSaved,
}: {
  open: boolean
  day: string | null
  accounts: SocialAccount[]
  workspaceId: string | null
  onClose: () => void
  onSaved: () => void
}) {
  const [accountIds, setAccountIds] = useState<string[]>([])
  const [content, setContent] = useState("")
  const [time, setTime] = useState("09:00")
  const [mediaUrl, setMediaUrl] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setAccountIds([])
    setContent("")
    setMediaUrl("")
    setTime("09:00")
  }, [open, accounts])

  const limit = accountIds.reduce(
    (current, id) => Math.min(current, CHANNEL_LIMIT[accounts.find((a) => a.id === id)?.channel ?? ""] ?? 2200),
    2200,
  )
  const over = content.length > limit

  const submit = async () => {
    if (!workspaceId || accountIds.length === 0 || !day) return
    setSaving(true)
    try {
      await Promise.all(accountIds.map((accountId) => schedulePost({
        workspaceId, accountId, content,
        scheduledAt: new Date(`${day}T${time}`).toISOString(), mediaUrl,
      })))
      toast.success(accountIds.length === 1 ? "Post agendado." : `Post agendado em ${accountIds.length} canais.`)
      onSaved()
    } catch {
      toast.error("Falha ao agendar o post.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Agendar post"
      description={
        day
          ? new Date(`${day}T12:00`).toLocaleDateString("pt-BR", {
              weekday: "long",
              day: "2-digit",
              month: "long",
            })
          : undefined
      }
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            size="sm"
            loading={saving}
            disabled={accountIds.length === 0 || !content.trim() || over}
            onClick={() => void submit()}
          >
            Agendar
          </Button>
        </>
      }
    >
      <div className="space-y-3">
          {accounts.length === 0 && (
            <div className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-[12px] text-ink dark:text-paper">
              Nenhuma conta conectada ainda. Você pode visualizar e preparar o post; conecte um canal em Redes sociais para liberar o agendamento.
            </div>
          )}
          <Field label="Onde publicar" hint="Marque uma ou mais contas.">
            <div className="grid gap-2 sm:grid-cols-2">
              {accounts.map((item) => {
                const selected = accountIds.includes(item.id)
                return <button key={item.id} type="button" aria-pressed={selected} onClick={() => setAccountIds((current) => selected ? current.filter((id) => id !== item.id) : [...current, item.id])} className={cx("flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors", selected ? "border-brand-500 bg-brand-50 text-brand-800 dark:bg-brand-950/40 dark:text-brand-200" : "border-paper-200 text-ink hover:bg-paper-50 dark:border-ink-700 dark:text-paper dark:hover:bg-ink-800")}>
                  <span className={cx("size-2 rounded-full", CHANNEL_COLOR[item.channel] ?? "bg-paper-400")} />
                  <span className="min-w-0 flex-1 truncate">{item.account_name}</span>
                  <span className="text-[10px] uppercase tracking-wide opacity-65">{CHANNEL_LABEL[item.channel] ?? item.channel}</span>
                </button>
              })}
              {accounts.length === 0 && ["Instagram", "Facebook", "LinkedIn", "TikTok"].map((channel) => <button key={channel} type="button" disabled className="flex cursor-not-allowed items-center gap-2 rounded-lg border border-dashed border-paper-200 px-3 py-2.5 text-left text-sm text-paper-500 dark:border-ink-700"><span className="size-2 rounded-full bg-paper-400" />{channel}<span className="ml-auto text-[10px]">não conectado</span></button>)}
            </div>
          </Field>

          <Field label="Horário">
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>

          <Field label="Conteúdo">
            <Textarea
              rows={6}
              value={content}
              placeholder="O que vai ao ar?"
              onChange={(e) => setContent(e.target.value)}
            />
          </Field>
          <p
            className={cx(
              "-mt-2 text-right text-[11px] tabular",
              over ? "text-danger" : "text-paper-400",
            )}
          >
            {content.length}/{limit}
          </p>

          <Field label="Mídia (URL)" hint="Opcional — imagem ou vídeo já hospedado.">
            <Input
              value={mediaUrl}
              placeholder="https://…"
              onChange={(e) => setMediaUrl(e.target.value)}
            />
          </Field>
      </div>
    </Modal>
  )
}
