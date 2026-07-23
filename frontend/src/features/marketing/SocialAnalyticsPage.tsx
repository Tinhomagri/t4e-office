// Analytics social — desempenho dos posts publicados, por canal e no total.
//
// A tela responde quatro perguntas na ordem em que o time pergunta: como está
// o número agora (KPIs com variação vs. período anterior), como chegou aqui
// (série diária), onde acontece (canal) e o que replicar (melhores posts e
// melhores horários).
import { useReducedMotion } from "framer-motion"
import {
  BarChart3,
  Download,
  Eye,
  Flame,
  Heart,
  MessageSquare,
  MousePointerClick,
  RefreshCw,
  Send,
  Share2,
  Sparkles,
} from "lucide-react"
import { useCallback, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { CHANNEL_LABEL } from "@/features/boards/views/CalendarioView"
import {
  type AnalyticsTimeseries,
  type MetricBundle,
  useAnalyticsTimeseries,
} from "@/features/integrations/insights.api"
import { useWorkspaceStore } from "@/features/workspace/workspace.store"
import {
  type CommandAction,
  FilterChip,
  MOD_LABEL,
  MetricStrip,
  MetricTile,
  Panel,
  SegmentedControl,
  ShareBar,
  compactNumber,
  percentDelta,
  useCommandPalette,
  useHotkey,
  usePersistedState,
} from "@/shared/ui/command-center"
import { Badge, Button, EmptyState, Kbd, PageHeader, Skeleton, cx } from "@/shared/ui/primitives"
import { toast } from "@/shared/ui/toast"

type MetricKey = keyof MetricBundle

const METRICS: { key: MetricKey; label: string; icon: typeof Eye }[] = [
  { key: "impressions", label: "Impressões", icon: Eye },
  { key: "likes", label: "Curtidas", icon: Heart },
  { key: "comments", label: "Comentários", icon: MessageSquare },
  { key: "shares", label: "Compart.", icon: Share2 },
  { key: "clicks", label: "Cliques", icon: MousePointerClick },
]

const PERIODS = [
  { value: "7", label: "7 dias" },
  { value: "30", label: "30 dias" },
  { value: "90", label: "90 dias" },
] as const

const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]

// Faixas de hora agrupadas — 24 colunas viram ruído ilegível numa tela densa.
const HOUR_BUCKETS: { label: string; hours: number[] }[] = [
  { label: "0-5", hours: [0, 1, 2, 3, 4, 5] },
  { label: "6-8", hours: [6, 7, 8] },
  { label: "9-11", hours: [9, 10, 11] },
  { label: "12-14", hours: [12, 13, 14] },
  { label: "15-17", hours: [15, 16, 17] },
  { label: "18-20", hours: [18, 19, 20] },
  { label: "21-23", hours: [21, 22, 23] },
]

const CHANNEL_BAR: Record<string, string> = {
  instagram: "bg-red-400",
  facebook: "bg-brand-500",
  linkedin: "bg-brand-600",
  x: "bg-ink-700",
  tiktok: "bg-ink-500",
  youtube: "bg-red-500",
}

function shortDate(iso: string): string {
  const [, m, d] = iso.split("-")
  return `${d}/${m}`
}

function csvEscape(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

function exportCsv(data: AnalyticsTimeseries): void {
  const header = ["data", "posts", ...METRICS.map((m) => m.key)].join(",")
  const rows = data.series.map((point) =>
    [point.date, point.posts, ...METRICS.map((m) => point[m.key])].join(","),
  )
  const top = [
    "",
    "melhores posts",
    ["canal", "conta", "publicado_em", "engajamento_%", "conteudo", ...METRICS.map((m) => m.key)].join(","),
    ...data.top_posts.map((p) =>
      [
        p.channel,
        csvEscape(p.account_name),
        p.published_at,
        p.engagement_rate,
        csvEscape(p.content),
        ...METRICS.map((m) => p.metrics[m.key]),
      ].join(","),
    ),
  ]
  const blob = new Blob([[header, ...rows, ...top].join("\n")], {
    type: "text/csv;charset=utf-8",
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `analytics-social-${data.range.start}-a-${data.range.end}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

export function SocialAnalyticsPage() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const navigate = useNavigate()
  const reduce = useReducedMotion()
  const [days, setDays] = usePersistedState<"7" | "30" | "90">("analytics:days", "30")
  const [metric, setMetric] = usePersistedState<MetricKey>("analytics:metric", "impressions")
  const [channel, setChannel] = useState<string | null>(null)

  const query = useAnalyticsTimeseries(workspaceId, Number(days), channel ?? undefined)
  const data = query.data

  const refetch = query.refetch
  const refresh = useCallback(() => void refetch(), [refetch])
  useHotkey("mod+r", refresh)

  const channels = useMemo(() => Object.keys(data?.by_channel ?? {}).sort(), [data])

  const chartData = useMemo(
    () =>
      (data?.series ?? []).map((point) => ({
        ...point,
        label: shortDate(point.date),
      })),
    [data],
  )

  // Heatmap normalizado: cada célula vira intensidade 0–1 sobre o pico da grade.
  const heat = useMemo(() => {
    if (!data) return { grid: [] as number[][], peak: 0, best: null as string | null }
    const grid = WEEKDAYS.map((_, weekday) =>
      HOUR_BUCKETS.map((bucket) => {
        const byHour = data.heatmap[String(weekday)] ?? {}
        return bucket.hours.reduce((acc, h) => acc + (byHour[String(h)] ?? 0), 0)
      }),
    )
    let peak = 0
    let best: string | null = null
    grid.forEach((row, weekday) =>
      row.forEach((value, bucket) => {
        if (value > peak) {
          peak = value
          best = `${WEEKDAYS[weekday]} · ${HOUR_BUCKETS[bucket].label}h`
        }
      }),
    )
    return { grid, peak, best }
  }, [data])

  const actions = useMemo<CommandAction[]>(() => {
    const list: CommandAction[] = [
      {
        id: "refresh",
        label: "Atualizar métricas",
        icon: <RefreshCw className="size-4" />,
        shortcut: `${MOD_LABEL}R`,
        run: refresh,
      },
      {
        id: "export",
        label: "Exportar CSV do período",
        icon: <Download className="size-4" />,
        run: () => {
          if (!data) return toast.error("Nada para exportar ainda.")
          exportCsv(data)
          toast.success("CSV gerado.")
        },
      },
      {
        id: "queue",
        label: "Ir para a fila de publicação",
        icon: <Send className="size-4" />,
        run: () => navigate("/app/marketing/fila"),
      },
    ]
    for (const period of PERIODS) {
      list.push({
        id: `period-${period.value}`,
        label: `Período: ${period.label}`,
        group: "Período",
        icon: <BarChart3 className="size-4" />,
        run: () => setDays(period.value),
      })
    }
    for (const m of METRICS) {
      list.push({
        id: `metric-${m.key}`,
        label: `Métrica do gráfico: ${m.label}`,
        group: "Métrica",
        icon: <m.icon className="size-4" />,
        run: () => setMetric(m.key),
      })
    }
    return list
  }, [data, refresh, navigate, setDays, setMetric])

  const { palette, setOpen } = useCommandPalette(actions)

  const totals = data?.totals
  const previous = data?.previous

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4 p-4 sm:p-6">
      {palette}

      <PageHeader
        eyebrow="Marketing"
        title="Analytics social"
        subtitle={
          data
            ? `${data.totals.posts} publicações entre ${shortDate(data.range.start)} e ${shortDate(data.range.end)}.`
            : "Desempenho dos posts publicados, por canal e no total."
        }
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
          variant="outline"
          size="sm"
          icon={<Download className="size-3.5" />}
          disabled={!data || data.totals.posts === 0}
          onClick={() => data && exportCsv(data)}
        >
          CSV
        </Button>
        <Button
          variant="outline"
          size="sm"
          icon={<RefreshCw className="size-3.5" />}
          loading={query.isFetching}
          onClick={refresh}
        >
          Atualizar
        </Button>
      </PageHeader>

      {!workspaceId ? (
        <EmptyState
          title="Selecione um workspace"
          description="As métricas são consolidadas por workspace."
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <SegmentedControl
              layoutId="analytics-period"
              ariaLabel="Período"
              value={days}
              onChange={setDays}
              options={PERIODS.map((p) => ({ value: p.value, label: p.label }))}
            />
            <span className="mx-1 hidden h-5 w-px bg-paper-200 dark:bg-ink-700 sm:block" />
            <div className="flex flex-wrap items-center gap-1.5">
              <FilterChip
                label="Todos os canais"
                active={channel === null}
                onClick={() => setChannel(null)}
              />
              {channels.map((ch) => (
                <FilterChip
                  key={ch}
                  label={CHANNEL_LABEL[ch] ?? ch}
                  count={data?.by_channel[ch]?.posts}
                  active={channel === ch}
                  dotClass={CHANNEL_BAR[ch] ?? "bg-paper-400"}
                  onClick={() => setChannel((c) => (c === ch ? null : ch))}
                />
              ))}
            </div>
          </div>

          {query.isLoading ? (
            <>
              <Skeleton className="h-24 rounded-lg" />
              <Skeleton className="h-72 rounded-lg" />
            </>
          ) : !totals || totals.posts === 0 ? (
            <EmptyState
              icon={<BarChart3 className="size-5" />}
              title="Nenhuma publicação no período"
              description="Publique pelo calendário editorial ou amplie o período para ver métricas."
              action={
                <Button size="sm" onClick={() => navigate("/app/marketing/calendario")}>
                  Abrir calendário editorial
                </Button>
              }
            />
          ) : (
            <>
              <MetricStrip>
                <MetricTile
                  label="Publicações"
                  value={String(totals.posts)}
                  rawValue={totals.posts}
                  delta={percentDelta(totals.posts, previous?.posts ?? 0)}
                  icon={<Send className="size-3.5" />}
                />
                {METRICS.map((m) => (
                  <MetricTile
                    key={m.key}
                    label={m.label}
                    value={compactNumber(totals[m.key])}
                    rawValue={totals[m.key]}
                    delta={percentDelta(totals[m.key], previous?.[m.key] ?? 0)}
                    icon={<m.icon className="size-3.5" />}
                    tone={metric === m.key ? "brand" : "neutral"}
                    active={metric === m.key}
                    hint={`Ver ${m.label.toLowerCase()} no gráfico`}
                    onClick={() => setMetric(m.key)}
                  />
                ))}
              </MetricStrip>

              <div className="grid gap-4 xl:grid-cols-3">
                <Panel
                  className="xl:col-span-2"
                  title={METRICS.find((m) => m.key === metric)?.label ?? "Série"}
                  subtitle={`Por dia · ${days} dias${channel ? ` · ${CHANNEL_LABEL[channel] ?? channel}` : ""}`}
                  actions={
                    <Badge tone="brand">
                      {totals.engagement_rate.toFixed(1)}% engajamento
                    </Badge>
                  }
                  bodyClassName="p-3"
                >
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
                        <defs>
                          <linearGradient id="metric-fill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#0C66E4" stopOpacity={0.28} />
                            <stop offset="100%" stopColor="#0C66E4" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#DCDFE4" vertical={false} />
                        <XAxis
                          dataKey="label"
                          tick={{ fontSize: 11, fill: "#626F86" }}
                          tickLine={false}
                          axisLine={false}
                          minTickGap={24}
                        />
                        <YAxis
                          tick={{ fontSize: 11, fill: "#626F86" }}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={compactNumber}
                          width={52}
                        />
                        <Tooltip
                          cursor={{ stroke: "#B3B9C4", strokeWidth: 1 }}
                          contentStyle={{
                            borderRadius: 6,
                            border: "1px solid #DCDFE4",
                            fontSize: 12,
                            boxShadow: "0 8px 16px -4px rgb(9 30 66 / 0.20)",
                          }}
                          formatter={(value) => [
                            Number(value ?? 0).toLocaleString("pt-BR"),
                            METRICS.find((m) => m.key === metric)?.label ?? metric,
                          ]}
                        />
                        <Area
                          type="monotone"
                          dataKey={metric}
                          stroke="#0C66E4"
                          strokeWidth={2}
                          fill="url(#metric-fill)"
                          isAnimationActive={!reduce}
                          animationDuration={320}
                          dot={false}
                          activeDot={{ r: 3 }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </Panel>

                <Panel
                  title="Por canal"
                  subtitle="Participação nas impressões e engajamento"
                  bodyClassName="divide-y divide-paper-200 dark:divide-ink-700"
                >
                  <div className="p-3">
                    <ShareBar
                      segments={channels.map((ch) => ({
                        key: ch,
                        label: CHANNEL_LABEL[ch] ?? ch,
                        value: data?.by_channel[ch]?.impressions ?? 0,
                        className: CHANNEL_BAR[ch] ?? "bg-paper-400",
                      }))}
                    />
                  </div>
                  {channels.length === 0 && (
                    <p className="px-3 py-4 text-[13px] text-paper-500">Sem dados por canal.</p>
                  )}
                  {channels.map((ch) => {
                    const stats = data!.by_channel[ch]
                    return (
                      <button
                        key={ch}
                        type="button"
                        onClick={() => setChannel((c) => (c === ch ? null : ch))}
                        className={cx(
                          "flex w-full items-center gap-3 px-3 py-2 text-left transition-colors duration-150 focus-ring",
                          channel === ch
                            ? "bg-brand-50/70 dark:bg-brand-900/20"
                            : "hover:bg-paper-50 dark:hover:bg-ink-800",
                        )}
                      >
                        <span
                          className={cx("size-2 shrink-0 rounded-full", CHANNEL_BAR[ch] ?? "bg-paper-400")}
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium text-ink dark:text-paper">
                            {CHANNEL_LABEL[ch] ?? ch}
                          </span>
                          <span className="block text-[11px] text-paper-500">
                            {stats.posts} posts · {stats.engagement_rate.toFixed(1)}% eng.
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block text-[13px] font-semibold tabular text-ink dark:text-paper">
                            {compactNumber(stats.impressions)}
                          </span>
                          <span className="block text-[10px] uppercase tracking-wide text-paper-500">
                            impressões
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </Panel>
              </div>

              <div className="grid gap-4 xl:grid-cols-3">
                <Panel
                  className="xl:col-span-2"
                  title="Melhores posts"
                  subtitle="Ordenados por impressões no período"
                  bodyClassName="divide-y divide-paper-200 dark:divide-ink-700"
                >
                  {data!.top_posts.length === 0 && (
                    <p className="px-3 py-4 text-[13px] text-paper-500">Nenhum post publicado.</p>
                  )}
                  {data!.top_posts.map((post, i) => (
                    <article
                      key={post.id}
                      className="flex items-start gap-3 px-3 py-2.5 transition-colors duration-150 hover:bg-paper-50 dark:hover:bg-ink-800"
                    >
                      <span className="mt-0.5 w-5 shrink-0 text-right text-[12px] font-semibold tabular text-paper-400">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] text-ink dark:text-paper">
                          {post.content || "—"}
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-paper-500">
                          <span className="inline-flex items-center gap-1">
                            <span
                              className={cx(
                                "size-1.5 rounded-full",
                                CHANNEL_BAR[post.channel] ?? "bg-paper-400",
                              )}
                            />
                            {CHANNEL_LABEL[post.channel] ?? post.channel}
                          </span>
                          <span>{post.account_name}</span>
                          <span>
                            {new Date(post.published_at).toLocaleDateString("pt-BR", {
                              day: "2-digit",
                              month: "2-digit",
                            })}
                          </span>
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3 text-right">
                        {(["impressions", "likes", "clicks"] as const).map((key) => (
                          <span key={key} className="hidden sm:block">
                            <span className="block text-[13px] font-semibold tabular text-ink dark:text-paper">
                              {compactNumber(post.metrics[key])}
                            </span>
                            <span className="block text-[10px] uppercase tracking-wide text-paper-500">
                              {METRICS.find((m) => m.key === key)?.label}
                            </span>
                          </span>
                        ))}
                        <Badge tone={post.engagement_rate >= totals.engagement_rate ? "success" : "neutral"}>
                          {post.engagement_rate.toFixed(1)}%
                        </Badge>
                      </div>
                    </article>
                  ))}
                </Panel>

                <Panel
                  title="Quando publicar"
                  subtitle={heat.best ? `Pico: ${heat.best}` : "Impressões por dia e faixa de hora"}
                  actions={<Flame className="size-4 text-paper-400" />}
                  bodyClassName="p-3"
                >
                  <div className="overflow-x-auto scrollbar-slim">
                    <table className="w-full border-separate border-spacing-0.5 text-[10px]">
                      <thead>
                        <tr>
                          <th className="w-8" />
                          {HOUR_BUCKETS.map((b) => (
                            <th key={b.label} className="pb-1 font-medium text-paper-500">
                              {b.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {WEEKDAYS.map((day, weekday) => (
                          <tr key={day}>
                            <th className="pr-1 text-right font-medium text-paper-500">{day}</th>
                            {HOUR_BUCKETS.map((bucket, i) => {
                              const value = heat.grid[weekday]?.[i] ?? 0
                              const intensity = heat.peak ? value / heat.peak : 0
                              return (
                                <td
                                  key={bucket.label}
                                  title={`${day} ${bucket.label}h · ${compactNumber(value)} impressões`}
                                  className="h-6 rounded-[3px] bg-brand-500 transition-opacity duration-150"
                                  style={{
                                    // 0.06 mantém a célula vazia visível como grade,
                                    // sem competir com as células quentes.
                                    opacity: value === 0 ? 0.06 : 0.15 + intensity * 0.85,
                                  }}
                                />
                              )
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-2 text-[11px] text-paper-500">
                    Baseado nas impressões dos posts já publicados neste período. Use como ponto de
                    partida do agendamento, não como regra.
                  </p>
                </Panel>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
