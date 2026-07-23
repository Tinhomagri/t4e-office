// Fila de publicação — mesa de controle do disparo automático.
//
// O worker do backend (publish_due_posts via cron) é quem publica no horário.
// Esta tela existe para o time ver o estado da fila e intervir: publicar antes
// da hora, reenfileirar o que falhou, adiar, remover. Tudo em lote, porque
// quando algo quebra costuma quebrar em vários posts de uma vez.
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
  Clock4,
  FileEdit,
  Gauge,
  Radio,
  RefreshCw,
  Send,
  Sparkles,
  Timer,
  Trash2,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"

import { CHANNEL_LABEL } from "@/features/boards/views/CalendarioView"
import { useQueueStats } from "@/features/integrations/insights.api"
import {
  deletePost,
  listPosts,
  publishPost,
  type ScheduledPost,
  updatePost,
} from "@/features/integrations/social.api"
import { useWorkspaceStore } from "@/features/workspace/workspace.store"
import { EASE } from "@/shared/lib/motion"
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
import { Badge, Button, EmptyState, Kbd, PageHeader, Skeleton, cx } from "@/shared/ui/primitives"
import { toast } from "@/shared/ui/toast"

type StatusKey = ScheduledPost["status"]
type SortKey = "schedule-asc" | "schedule-desc" | "channel"

const STATUS_META: Record<
  StatusKey,
  { label: string; tone: "neutral" | "brand" | "success" | "danger"; icon: typeof Clock; dot: string }
> = {
  draft: { label: "Rascunho", tone: "neutral", icon: FileEdit, dot: "bg-paper-400" },
  scheduled: { label: "Na fila", tone: "brand", icon: Clock, dot: "bg-brand-500" },
  published: { label: "Publicado", tone: "success", icon: CheckCircle2, dot: "bg-success" },
  failed: { label: "Falhou", tone: "danger", icon: AlertTriangle, dot: "bg-danger" },
}

const STATUS_ORDER: StatusKey[] = ["failed", "scheduled", "draft", "published"]

const REFRESH_OPTIONS = [
  { value: "off", label: "Manual" },
  { value: "30", label: "30s" },
  { value: "120", label: "2min" },
] as const

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
}

function dayLabel(iso: string): string {
  const date = new Date(iso)
  const today = new Date()
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const diffDays = Math.round((startOfDay(date) - startOfDay(today)) / 86_400_000)
  if (diffDays === 0) return "Hoje"
  if (diffDays === 1) return "Amanhã"
  if (diffDays === -1) return "Ontem"
  return date.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })
}

/** Tempo relativo curto ("em 2h", "há 15min") para a coluna de horário. */
function relative(iso: string): string {
  const diffMin = Math.round((new Date(iso).getTime() - Date.now()) / 60_000)
  const abs = Math.abs(diffMin)
  const unit =
    abs < 60 ? `${abs}min` : abs < 1440 ? `${Math.round(abs / 60)}h` : `${Math.round(abs / 1440)}d`
  return diffMin >= 0 ? `em ${unit}` : `há ${unit}`
}

export function PublishQueuePage() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const navigate = useNavigate()
  const reduce = useReducedMotion()

  const [posts, setPosts] = useState<ScheduledPost[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState("")
  const [statuses, setStatuses] = usePersistedState<StatusKey[]>("queue:statuses", [
    "failed",
    "scheduled",
    "draft",
  ])
  const [channelFilter, setChannelFilter] = useState<string | null>(null)
  const [sort, setSort] = usePersistedState<SortKey>("queue:sort", "schedule-asc")
  const [autoRefresh, setAutoRefresh] = usePersistedState<"off" | "30" | "120">(
    "queue:auto-refresh",
    "off",
  )

  const refreshMs = autoRefresh === "off" ? undefined : Number(autoRefresh) * 1000
  const stats = useQueueStats(workspaceId, refreshMs)

  const load = useCallback(() => {
    if (!workspaceId) return
    setLoading(true)
    listPosts(workspaceId)
      .then(setPosts)
      .catch(() => toast.error("Falha ao carregar a fila."))
      .finally(() => setLoading(false))
  }, [workspaceId])

  useEffect(() => {
    load()
  }, [load])

  // Auto-refresh da lista acompanha o intervalo escolhido para as estatísticas.
  useEffect(() => {
    if (!refreshMs) return
    const id = window.setInterval(load, refreshMs)
    return () => window.clearInterval(id)
  }, [refreshMs, load])

  const refetchStats = stats.refetch
  const refreshAll = useCallback(() => {
    load()
    void refetchStats()
  }, [load, refetchStats])

  useHotkey("mod+r", refreshAll)

  const markBusy = (ids: string[], on: boolean) =>
    setBusy((prev) => {
      const next = new Set(prev)
      for (const id of ids) (on ? next.add(id) : next.delete(id))
      return next
    })

  // ── Ações ─────────────────────────────────────────────────────────────────
  const runBatch = async (
    ids: string[],
    op: (id: string) => Promise<unknown>,
    labels: { done: string; fail: string },
  ) => {
    if (ids.length === 0) return
    markBusy(ids, true)
    const results = await Promise.allSettled(ids.map(op))
    markBusy(ids, false)
    const failures = results.filter((r) => r.status === "rejected").length
    if (failures === 0) toast.success(`${labels.done} (${ids.length}).`)
    else if (failures === ids.length) toast.error(labels.fail)
    else toast.error(`${labels.done}, mas ${failures} falharam.`)
    setSelected(new Set())
    refreshAll()
  }

  const publishNow = (ids: string[]) =>
    runBatch(ids, publishPost, { done: "Publicado", fail: "Falha ao publicar." })

  const requeue = (ids: string[]) =>
    // PATCH reabre a fila: o backend zera attempts/erro quando status=failed.
    runBatch(ids, (id) => updatePost(id, { scheduled_at: new Date().toISOString() }), {
      done: "Reenfileirado",
      fail: "Falha ao reenfileirar.",
    })

  const snooze = (ids: string[], hours: number) =>
    runBatch(
      ids,
      (id) => {
        const post = posts.find((p) => p.id === id)
        const base = post ? new Date(post.scheduled_at).getTime() : Date.now()
        return updatePost(id, {
          scheduled_at: new Date(Math.max(base, Date.now()) + hours * 3_600_000).toISOString(),
        })
      },
      { done: `Adiado em ${hours}h`, fail: "Falha ao adiar." },
    )

  const remove = (ids: string[]) =>
    runBatch(ids, deletePost, { done: "Removido", fail: "Falha ao remover." })

  // ── Derivados ─────────────────────────────────────────────────────────────
  const channels = useMemo(
    () => Array.from(new Set(posts.map((p) => p.channel))).sort(),
    [posts],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = posts.filter((p) => {
      if (!statuses.includes(p.status)) return false
      if (channelFilter && p.channel !== channelFilter) return false
      if (!q) return true
      return (
        p.content.toLowerCase().includes(q) ||
        p.account_name.toLowerCase().includes(q) ||
        (CHANNEL_LABEL[p.channel] ?? p.channel).toLowerCase().includes(q)
      )
    })
    return list.sort((a, b) => {
      if (sort === "channel") {
        const byChannel = a.channel.localeCompare(b.channel)
        if (byChannel !== 0) return byChannel
      }
      const delta =
        new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
      return sort === "schedule-desc" ? -delta : delta
    })
  }, [posts, statuses, channelFilter, query, sort])

  // Agrupa por dia — a fila é lida como agenda, não como lista contínua.
  const groups = useMemo(() => {
    const map = new Map<string, ScheduledPost[]>()
    for (const post of filtered) {
      const key = post.scheduled_at.slice(0, 10)
      const bucket = map.get(key)
      if (bucket) bucket.push(post)
      else map.set(key, [post])
    }
    return Array.from(map.entries())
  }, [filtered])

  const selectedIds = useMemo(
    () => filtered.filter((p) => selected.has(p.id)).map((p) => p.id),
    [filtered, selected],
  )
  const selectedPosts = useMemo(
    () => filtered.filter((p) => selected.has(p.id)),
    [filtered, selected],
  )
  const canPublish = selectedPosts.some((p) => p.status !== "published")
  const canRequeue = selectedPosts.some((p) => p.status === "failed")

  const toggleStatus = (status: StatusKey) =>
    setStatuses((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status],
    )

  const toggleSelectAll = () =>
    setSelected((prev) =>
      prev.size === filtered.length ? new Set() : new Set(filtered.map((p) => p.id)),
    )

  useHotkey("mod+a", toggleSelectAll, { enabled: filtered.length > 0 })
  useHotkey("escape", () => setSelected(new Set()), { enabled: selected.size > 0 })

  const byStatus = stats.data?.by_status
  const upcomingSpark = useMemo(() => {
    const upcoming = stats.data?.upcoming ?? {}
    return Array.from({ length: 14 }, (_, i) => {
      const day = new Date()
      day.setDate(day.getDate() + i)
      return upcoming[day.toISOString().slice(0, 10)] ?? 0
    })
  }, [stats.data])

  const actions = useMemo<CommandAction[]>(
    () => [
      {
        id: "refresh",
        label: "Atualizar fila",
        icon: <RefreshCw className="size-4" />,
        shortcut: `${MOD_LABEL}R`,
        run: refreshAll,
      },
      {
        id: "publish-selected",
        label: `Publicar agora (${selectedIds.length} selecionados)`,
        icon: <Send className="size-4" />,
        run: () => void publishNow(selectedIds.filter((id) => {
          const post = posts.find((p) => p.id === id)
          return post && post.status !== "published"
        })),
      },
      {
        id: "requeue-failed",
        label: "Reenfileirar todos os que falharam",
        icon: <RefreshCw className="size-4" />,
        run: () =>
          void requeue(posts.filter((p) => p.status === "failed").map((p) => p.id)),
      },
      {
        id: "select-all",
        label: "Selecionar tudo que está visível",
        icon: <CheckCircle2 className="size-4" />,
        shortcut: `${MOD_LABEL}A`,
        run: toggleSelectAll,
      },
      {
        id: "only-failed",
        label: "Filtrar só as falhas",
        icon: <AlertTriangle className="size-4" />,
        run: () => setStatuses(["failed"]),
      },
      {
        id: "reset-filters",
        label: "Restaurar filtros padrão",
        icon: <Gauge className="size-4" />,
        run: () => {
          setStatuses(["failed", "scheduled", "draft"])
          setChannelFilter(null)
          setQuery("")
        },
      },
      {
        id: "calendar",
        label: "Ir para o calendário editorial",
        icon: <CalendarClock className="size-4" />,
        run: () => navigate("/app/marketing/calendario"),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedIds, posts, refreshAll, navigate],
  )

  const { palette, setOpen } = useCommandPalette(actions)

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4 p-4 sm:p-6">
      {palette}

      <PageHeader
        eyebrow="Marketing"
        title="Fila de publicação"
        subtitle="Posts agendados disparam sozinhos no horário. Acompanhe, intervenha e corrija em lote."
      >
        <Button
          variant="outline"
          size="sm"
          icon={<Sparkles className="size-3.5" />}
          onClick={() => setOpen(true)}
        >
          Comandos <Kbd>{MOD_LABEL}K</Kbd>
        </Button>
        <SegmentedControl
          layoutId="queue-refresh"
          size="sm"
          ariaLabel="Atualização automática"
          value={autoRefresh}
          onChange={setAutoRefresh}
          options={REFRESH_OPTIONS.map((o) => ({
            value: o.value,
            label: o.label,
            icon: o.value === "off" ? undefined : <Radio className="size-3" />,
          }))}
        />
        <Button
          variant="outline"
          size="sm"
          icon={<RefreshCw className="size-3.5" />}
          loading={loading}
          onClick={refreshAll}
        >
          Atualizar
        </Button>
      </PageHeader>

      {!workspaceId ? (
        <EmptyState
          title="Selecione um workspace"
          description="A fila de publicação é organizada por workspace."
        />
      ) : (
        <>
          <MetricStrip>
            <MetricTile
              label="Na fila"
              value={String(byStatus?.scheduled ?? 0)}
              rawValue={byStatus?.scheduled ?? 0}
              tone="brand"
              spark={upcomingSpark}
              icon={<Clock className="size-3.5" />}
              hint="Próximos 14 dias"
              active={statuses.length === 1 && statuses[0] === "scheduled"}
              onClick={() => setStatuses(["scheduled"])}
            />
            <MetricTile
              label="Atrasados"
              value={String(stats.data?.overdue ?? 0)}
              rawValue={stats.data?.overdue ?? 0}
              tone={(stats.data?.overdue ?? 0) > 0 ? "warning" : "neutral"}
              icon={<Timer className="size-3.5" />}
              hint="Passou do horário e ainda não publicou — worker travado?"
            />
            <MetricTile
              label="Falhas"
              value={String(byStatus?.failed ?? 0)}
              rawValue={byStatus?.failed ?? 0}
              tone={(byStatus?.failed ?? 0) > 0 ? "danger" : "neutral"}
              icon={<AlertTriangle className="size-3.5" />}
              hint="Ver apenas as falhas"
              active={statuses.length === 1 && statuses[0] === "failed"}
              onClick={() => setStatuses(["failed"])}
            />
            <MetricTile
              label="Publicados (7d)"
              value={String(stats.data?.last_7d.published ?? 0)}
              rawValue={stats.data?.last_7d.published ?? 0}
              tone="success"
              icon={<CheckCircle2 className="size-3.5" />}
            />
            <MetricTile
              label="Taxa de sucesso"
              value={`${(stats.data?.last_7d.success_rate ?? 100).toFixed(0)}%`}
              tone={(stats.data?.last_7d.success_rate ?? 100) >= 95 ? "success" : "warning"}
              icon={<Gauge className="size-3.5" />}
              hint="Publicados ÷ tentativas nos últimos 7 dias"
            />
            <MetricTile
              label="Rascunhos"
              value={String(byStatus?.draft ?? 0)}
              rawValue={byStatus?.draft ?? 0}
              icon={<FileEdit className="size-3.5" />}
              active={statuses.length === 1 && statuses[0] === "draft"}
              onClick={() => setStatuses(["draft"])}
            />
          </MetricStrip>

          {stats.data?.next_post && (
            <div className="flex items-center gap-2.5 rounded-lg border border-brand-200 bg-brand-50/60 px-3 py-2 text-[13px] dark:border-brand-500/40 dark:bg-brand-900/20">
              <Clock4 className="size-4 shrink-0 text-brand-600 dark:text-brand-300" />
              <span className="min-w-0 flex-1 truncate text-ink dark:text-paper">
                <span className="font-medium">Próximo disparo</span>{" "}
                <span className="text-paper-500">
                  · {CHANNEL_LABEL[stats.data.next_post.channel] ?? stats.data.next_post.channel} ·{" "}
                  {stats.data.next_post.content || "—"}
                </span>
              </span>
              <Badge tone="brand">
                {fmtDateTime(stats.data.next_post.scheduled_at)} ·{" "}
                {relative(stats.data.next_post.scheduled_at)}
              </Badge>
            </div>
          )}

          <Toolbar>
            <SearchField
              value={query}
              onChange={setQuery}
              placeholder="Buscar por conteúdo, conta ou canal…"
              className="min-w-[220px]"
            />
            <div className="flex flex-wrap items-center gap-1.5">
              {STATUS_ORDER.map((status) => (
                <FilterChip
                  key={status}
                  label={STATUS_META[status].label}
                  count={byStatus?.[status]}
                  dotClass={STATUS_META[status].dot}
                  active={statuses.includes(status)}
                  onClick={() => toggleStatus(status)}
                />
              ))}
            </div>
            {channels.length > 1 && (
              <>
                <span className="hidden h-5 w-px bg-paper-200 dark:bg-ink-700 sm:block" />
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
              </>
            )}
            <div className="ml-auto">
              <SegmentedControl
                layoutId="queue-sort"
                size="sm"
                ariaLabel="Ordenação"
                value={sort}
                onChange={setSort}
                options={[
                  { value: "schedule-asc", label: "Próximos" },
                  { value: "schedule-desc", label: "Recentes" },
                  { value: "channel", label: "Canal" },
                ]}
              />
            </div>
          </Toolbar>

          {/* Barra de ações em lote — entra só quando há seleção. */}
          <AnimatePresence>
            {selectedIds.length > 0 && (
              <motion.div
                key="bulk"
                initial={reduce ? false : { opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: { duration: 0.12 } }}
                transition={{ duration: 0.18, ease: EASE }}
                className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-brand-300 bg-brand-50 px-3 py-2 shadow-card dark:border-brand-500/50 dark:bg-brand-900/30"
              >
                <span className="text-[13px] font-medium text-brand-700 dark:text-brand-200">
                  {selectedIds.length} selecionado{selectedIds.length > 1 ? "s" : ""}
                </span>
                <span className="h-5 w-px bg-brand-200 dark:bg-brand-500/40" />
                <Button
                  size="sm"
                  icon={<Send className="size-3.5" />}
                  disabled={!canPublish}
                  onClick={() =>
                    void publishNow(selectedPosts.filter((p) => p.status !== "published").map((p) => p.id))
                  }
                >
                  Publicar agora
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  icon={<RefreshCw className="size-3.5" />}
                  disabled={!canRequeue}
                  onClick={() =>
                    void requeue(selectedPosts.filter((p) => p.status === "failed").map((p) => p.id))
                  }
                >
                  Reenfileirar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  icon={<Timer className="size-3.5" />}
                  onClick={() => void snooze(selectedIds, 1)}
                >
                  Adiar 1h
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  icon={<Timer className="size-3.5" />}
                  onClick={() => void snooze(selectedIds, 24)}
                >
                  Adiar 1 dia
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  icon={<Trash2 className="size-3.5" />}
                  onClick={() => void remove(selectedIds)}
                >
                  Remover
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                  Limpar <Kbd>Esc</Kbd>
                </Button>
              </motion.div>
            )}
          </AnimatePresence>

          <Panel
            title="Fila"
            subtitle={`${filtered.length} post${filtered.length === 1 ? "" : "s"} · ${posts.length} no total`}
            actions={
              filtered.length > 0 && (
                <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-paper-500">
                  <input
                    type="checkbox"
                    className="size-3.5 accent-brand-500 focus-ring"
                    checked={selected.size === filtered.length && filtered.length > 0}
                    onChange={toggleSelectAll}
                  />
                  Selecionar tudo
                </label>
              )
            }
          >
            {loading && posts.length === 0 ? (
              <div className="space-y-2 p-3">
                {Array.from({ length: 5 }, (_, i) => (
                  <Skeleton key={i} className="h-14 rounded-md" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={<Send className="size-5" />}
                title={posts.length === 0 ? "Nenhum post na fila" : "Nada com esses filtros"}
                description={
                  posts.length === 0
                    ? "Agende publicações pelo calendário editorial ou direto de um card."
                    : "Ajuste os filtros de status, canal ou a busca."
                }
                action={
                  posts.length === 0 ? (
                    <Button size="sm" onClick={() => navigate("/app/marketing/calendario")}>
                      Abrir calendário editorial
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setStatuses(["failed", "scheduled", "draft", "published"])
                        setChannelFilter(null)
                        setQuery("")
                      }}
                    >
                      Limpar filtros
                    </Button>
                  )
                }
                className="border-0 bg-transparent"
              />
            ) : (
              <div className="divide-y divide-paper-200 dark:divide-ink-700">
                {groups.map(([day, items]) => (
                  <section key={day}>
                    <header className="sticky top-0 z-[1] flex items-center justify-between gap-2 border-b border-paper-200 bg-paper-50/95 px-3 py-1.5 backdrop-blur-sm dark:border-ink-700 dark:bg-ink-900/95">
                      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-paper-500">
                        {dayLabel(items[0].scheduled_at)}
                      </h3>
                      <span className="text-[11px] tabular text-paper-400">
                        {items.length} post{items.length > 1 ? "s" : ""}
                      </span>
                    </header>
                    <AnimatePresence initial={false}>
                      {items.map((post) => {
                        const meta = STATUS_META[post.status]
                        const Icon = meta.icon
                        const isBusy = busy.has(post.id)
                        const isSelected = selected.has(post.id)
                        const late = post.status === "scheduled" && new Date(post.scheduled_at) < new Date()
                        const mediaCount = post.media_urls?.length || (post.media_url ? 1 : 0)
                        return (
                          <motion.div
                            key={post.id}
                            layout={!reduce}
                            initial={reduce ? false : { opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0, transition: { duration: 0.12 } }}
                            transition={{ duration: 0.18, ease: EASE }}
                            className={cx(
                              "flex items-start gap-3 px-3 py-2.5 transition-colors duration-150",
                              isSelected
                                ? "bg-brand-50/60 dark:bg-brand-900/20"
                                : "hover:bg-paper-50 dark:hover:bg-ink-800",
                              isBusy && "opacity-60",
                            )}
                          >
                            <input
                              type="checkbox"
                              aria-label={`Selecionar post de ${fmtTime(post.scheduled_at)}`}
                              className="mt-1 size-3.5 shrink-0 accent-brand-500 focus-ring"
                              checked={isSelected}
                              onChange={() =>
                                setSelected((prev) => {
                                  const next = new Set(prev)
                                  if (next.has(post.id)) next.delete(post.id)
                                  else next.add(post.id)
                                  return next
                                })
                              }
                            />

                            <div className="w-24 shrink-0">
                              <p className="text-[13px] font-semibold tabular text-ink dark:text-paper">
                                {fmtTime(post.scheduled_at)}
                              </p>
                              <p
                                className={cx(
                                  "text-[11px] tabular",
                                  late ? "text-warning" : "text-paper-400",
                                )}
                              >
                                {late ? "atrasado" : relative(post.scheduled_at)}
                              </p>
                            </div>

                            <div className="w-28 shrink-0">
                              <p className="truncate text-[12px] font-medium text-ink dark:text-paper">
                                {CHANNEL_LABEL[post.channel] ?? post.channel}
                              </p>
                              <p className="truncate text-[11px] text-paper-400">{post.account_name}</p>
                            </div>

                            <div className="min-w-0 flex-1">
                              <p className="line-clamp-2 text-[13px] text-ink dark:text-paper">
                                {post.content || "—"}
                              </p>
                              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-paper-400">
                                <Badge tone={meta.tone}>
                                  <Icon className="size-3" />
                                  {meta.label}
                                  {post.status === "failed" && post.attempts > 0
                                    ? ` · ${post.attempts}x`
                                    : ""}
                                </Badge>
                                {mediaCount > 0 && <span>{mediaCount} mídia(s)</span>}
                                {post.mentions?.length > 0 && (
                                  <span className="truncate">
                                    {post.mentions.map((m) => `@${m}`).join(" ")}
                                  </span>
                                )}
                                {post.status === "published" && post.metrics && (
                                  <span className="tabular">
                                    {compactNumber(post.metrics.impressions)} impressões ·{" "}
                                    {compactNumber(post.metrics.likes)} curtidas
                                  </span>
                                )}
                              </div>
                              {post.status === "failed" && post.error && (
                                <p className="mt-1 truncate text-[11px] text-danger" title={post.error}>
                                  {post.error}
                                </p>
                              )}
                            </div>

                            <div className="flex shrink-0 items-center gap-1">
                              {post.status === "failed" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  icon={<RefreshCw className="size-3.5" />}
                                  loading={isBusy}
                                  onClick={() => void requeue([post.id])}
                                >
                                  Reenfileirar
                                </Button>
                              )}
                              {post.status !== "published" && (
                                <>
                                  <Button
                                    size="sm"
                                    icon={<Send className="size-3.5" />}
                                    loading={isBusy}
                                    onClick={() => void publishNow([post.id])}
                                  >
                                    Publicar
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    icon={<Timer className="size-3.5" />}
                                    loading={isBusy}
                                    aria-label="Adiar 1 hora"
                                    title="Adiar 1 hora"
                                    onClick={() => void snooze([post.id], 1)}
                                  />
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    icon={<Trash2 className="size-3.5" />}
                                    loading={isBusy}
                                    aria-label="Remover post"
                                    title="Remover"
                                    onClick={() => void remove([post.id])}
                                  />
                                </>
                              )}
                            </div>
                          </motion.div>
                        )
                      })}
                    </AnimatePresence>
                  </section>
                ))}
              </div>
            )}
          </Panel>
        </>
      )}
    </div>
  )
}
