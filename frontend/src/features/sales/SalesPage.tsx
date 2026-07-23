// Shell do módulo Comercial: Visão geral · Pipeline · Clientes · Atividades.
//
// A barra de KPIs e a faixa de alertas ficam acima das abas porque valem para
// todas — quem abre "Clientes" continua vendo que há negócio vencido no funil.
// O indicador da aba ativa usa layoutId: desliza entre as abas em vez de
// piscar, dando continuidade espacial à navegação.
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  Gauge,
  LayoutDashboard,
  ListTodo,
  Sparkles,
  Target,
  Timer,
  TrendingUp,
  Trophy,
} from "lucide-react"
import { useMemo, useState } from "react"

import { useWorkspaceStore } from "@/features/workspace/workspace.store"
import { EASE, springSnappy } from "@/shared/lib/motion"
import {
  type CommandAction,
  MOD_LABEL,
  MetricStrip,
  MetricTile,
  Panel,
  SegmentedControl,
  ShareBar,
  compactCurrencyBRL,
  currencyBRL,
  useCommandPalette,
  usePersistedState,
} from "@/shared/ui/command-center"
import { Badge, Button, EmptyState, Kbd, PageHeader, Skeleton, cx } from "@/shared/ui/primitives"

import { usePipelineMetrics, type PipelineMetrics } from "./sales.metrics"
import { ActivitiesView } from "./views/ActivitiesView"
import { CustomersView } from "./views/CustomersView"
import { PipelineView } from "./views/PipelineView"

type SalesTab = "overview" | "pipeline" | "customers" | "activities"

const TABS: { id: SalesTab; label: string; icon: typeof Target }[] = [
  { id: "overview", label: "Visão geral", icon: LayoutDashboard },
  { id: "pipeline", label: "Pipeline", icon: Target },
  { id: "customers", label: "Clientes", icon: Building2 },
  { id: "activities", label: "Atividades", icon: ListTodo },
]

const WINDOWS = [
  { value: "30", label: "30 dias" },
  { value: "90", label: "90 dias" },
  { value: "365", label: "12 meses" },
] as const

// Escala de um tom só para os estágios: a cor separa colunas sem virar arco-íris.
const STAGE_BAR = ["bg-brand-500", "bg-brand-300", "bg-blue-200", "bg-neutral-400", "bg-neutral-300"]

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" })
}

export function SalesPage() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const reduce = useReducedMotion()
  const [tab, setTab] = useState<SalesTab>("overview")
  const [days, setDays] = usePersistedState<"30" | "90" | "365">("sales:window", "90")

  const { data: metrics, isLoading } = usePipelineMetrics(workspaceId, Number(days))

  const alerts = useMemo(
    () => ({
      deals: metrics?.overdue_deals.length ?? 0,
      activities: metrics?.overdue_activities.length ?? 0,
      stale: (metrics?.by_stage ?? []).reduce((acc, s) => acc + s.stale_count, 0),
    }),
    [metrics],
  )

  const actions = useMemo<CommandAction[]>(
    () => [
      ...TABS.map((t) => ({
        id: `tab-${t.id}`,
        label: `Ir para ${t.label}`,
        group: "Navegação",
        icon: <t.icon className="size-4" />,
        run: () => setTab(t.id),
      })),
      ...WINDOWS.map((w) => ({
        id: `window-${w.value}`,
        label: `Janela de análise: ${w.label}`,
        group: "Período",
        icon: <CalendarClock className="size-4" />,
        run: () => setDays(w.value),
      })),
      {
        id: "overdue",
        label: `Ver o que está atrasado (${alerts.deals + alerts.activities})`,
        icon: <AlertTriangle className="size-4" />,
        run: () => setTab("overview"),
      },
    ],
    [alerts.deals, alerts.activities, setDays],
  )

  const { palette, setOpen } = useCommandPalette(actions)

  return (
    <div className="flex flex-col gap-4">
      {palette}

      <PageHeader title="Comercial" subtitle="Funil de vendas, clientes e follow-ups do time.">
        <Button
          variant="outline"
          size="sm"
          icon={<Sparkles className="size-3.5" />}
          onClick={() => setOpen(true)}
        >
          Comandos <Kbd>{MOD_LABEL}K</Kbd>
        </Button>
        <SegmentedControl
          layoutId="sales-window"
          size="sm"
          ariaLabel="Janela de análise"
          value={days}
          onChange={setDays}
          options={WINDOWS.map((w) => ({ value: w.value, label: w.label }))}
        />
      </PageHeader>

      {!workspaceId ? (
        <EmptyState
          title="Selecione um workspace"
          description="O funil comercial é organizado por workspace."
        />
      ) : (
        <>
          {isLoading ? (
            <Skeleton className="h-24 rounded-lg" />
          ) : metrics ? (
            <MetricStrip>
              <MetricTile
                label="Negócios abertos"
                value={String(metrics.open.count)}
                rawValue={metrics.open.count}
                icon={<Target className="size-3.5" />}
                hint="Abrir o pipeline"
                onClick={() => setTab("pipeline")}
              />
              <MetricTile
                label="Valor no funil"
                value={compactCurrencyBRL(metrics.open.amount)}
                icon={<TrendingUp className="size-3.5" />}
                hint={currencyBRL(metrics.open.amount)}
              />
              <MetricTile
                label="Previsão ponderada"
                value={compactCurrencyBRL(metrics.open.weighted_amount)}
                tone="brand"
                icon={<Gauge className="size-3.5" />}
                hint={`${currencyBRL(metrics.open.weighted_amount)} · valor × probabilidade`}
              />
              <MetricTile
                label={`Taxa de ganho (${days}d)`}
                value={`${metrics.closed.win_rate.toFixed(0)}%`}
                tone={metrics.closed.win_rate >= 50 ? "success" : "neutral"}
                icon={<Trophy className="size-3.5" />}
                hint={`${metrics.closed.won_count} ganhos · ${metrics.closed.lost_count} perdidos`}
              />
              <MetricTile
                label="Ticket médio"
                value={compactCurrencyBRL(metrics.closed.avg_ticket)}
                icon={<TrendingUp className="size-3.5" />}
                hint={currencyBRL(metrics.closed.avg_ticket)}
              />
              <MetricTile
                label="Ciclo médio"
                value={`${metrics.closed.avg_cycle_days.toFixed(0)}d`}
                icon={<Timer className="size-3.5" />}
                hint="Da criação até o ganho"
              />
            </MetricStrip>
          ) : null}

          {(alerts.deals > 0 || alerts.activities > 0 || alerts.stale > 0) && (
            <button
              type="button"
              onClick={() => setTab("overview")}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-left text-[13px] transition-colors duration-150 hover:bg-warning/15 focus-ring"
            >
              <AlertTriangle className="size-4 shrink-0 text-warning" />
              <span className="font-medium text-ink dark:text-paper">Precisa de atenção:</span>
              {alerts.deals > 0 && (
                <Badge tone="warning">
                  {alerts.deals} negócio{alerts.deals > 1 ? "s" : ""} com data vencida
                </Badge>
              )}
              {alerts.stale > 0 && <Badge tone="warning">{alerts.stale} parados há 14d+</Badge>}
              {alerts.activities > 0 && (
                <Badge tone="danger">{alerts.activities} tarefas atrasadas</Badge>
              )}
            </button>
          )}

          {/* Abas: rolam horizontalmente no mobile, alvo de toque de 44px. */}
          <div
            role="tablist"
            aria-label="Seções do comercial"
            className="-mx-4 flex gap-1 overflow-x-auto px-4 scrollbar-slim sm:mx-0 sm:px-0"
          >
            {TABS.map((t) => {
              const active = tab === t.id
              const Icon = t.icon
              return (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(t.id)}
                  className={cx(
                    "relative flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3.5 text-sm font-medium transition-colors focus-ring",
                    active
                      ? "text-brand-700 dark:text-brand-300"
                      : "text-paper-500 hover:bg-paper-100 hover:text-ink dark:hover:bg-ink-800 dark:hover:text-paper",
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="sales-tab-pill"
                      transition={reduce ? { duration: 0 } : springSnappy}
                      className="absolute inset-0 -z-10 rounded-xl bg-brand-50 dark:bg-brand-900/30"
                    />
                  )}
                  <Icon className="size-4" />
                  {t.label}
                </button>
              )
            })}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2, ease: EASE }}
            >
              {tab === "overview" && (
                <OverviewTab
                  metrics={metrics}
                  loading={isLoading}
                  days={days}
                  onOpenPipeline={() => setTab("pipeline")}
                />
              )}
              {tab === "pipeline" && <PipelineView workspaceId={workspaceId} />}
              {tab === "customers" && <CustomersView workspaceId={workspaceId} />}
              {tab === "activities" && <ActivitiesView workspaceId={workspaceId} />}
            </motion.div>
          </AnimatePresence>
        </>
      )}
    </div>
  )
}

// ─── Visão geral ─────────────────────────────────────────────────────────────

function OverviewTab({
  metrics,
  loading,
  days,
  onOpenPipeline,
}: {
  metrics?: PipelineMetrics
  loading: boolean
  days: string
  onOpenPipeline: () => void
}) {
  if (loading) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-56 rounded-lg" />
        ))}
      </div>
    )
  }

  if (!metrics) {
    return (
      <EmptyState
        icon={<LayoutDashboard className="size-5" />}
        title="Sem dados do funil"
        description="Crie negócios no pipeline para ver os indicadores aqui."
        action={
          <Button size="sm" onClick={onOpenPipeline}>
            Abrir pipeline
          </Button>
        }
      />
    )
  }

  const openStages = metrics.by_stage.filter((s) => s.kind === "open")
  const maxForecast = Math.max(1, ...metrics.forecast.map((f) => Number(f.amount)))
  const maxStage = Math.max(1, ...openStages.map((s) => Number(s.total_amount)))

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel
        title="Funil por estágio"
        subtitle="Valor total e previsão ponderada em cada coluna"
        bodyClassName="space-y-3 p-3"
      >
        <ShareBar
          segments={openStages.map((stage, i) => ({
            key: stage.stage_id,
            label: stage.name,
            value: Number(stage.total_amount),
            className: STAGE_BAR[i % STAGE_BAR.length],
          }))}
        />
        {openStages.length === 0 && (
          <p className="py-4 text-[13px] text-paper-500">Nenhum estágio aberto configurado.</p>
        )}
        {openStages.map((stage, i) => (
          <div key={stage.stage_id} className="space-y-1">
            <div className="flex items-baseline justify-between gap-2 text-[12px]">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className={cx("size-2 shrink-0 rounded-full", STAGE_BAR[i % STAGE_BAR.length])} />
                <span className="truncate font-medium text-ink dark:text-paper">{stage.name}</span>
                <span className="tabular text-paper-400">{stage.count}</span>
                {stage.stale_count > 0 && (
                  <span className="rounded bg-warning/15 px-1 text-[10px] font-medium text-warning">
                    {stage.stale_count} parados
                  </span>
                )}
              </span>
              <span className="shrink-0 tabular text-paper-600 dark:text-paper-400">
                {compactCurrencyBRL(stage.total_amount)}
                <span className="ml-1 text-paper-400">
                  ~{compactCurrencyBRL(stage.weighted_amount)}
                </span>
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-paper-100 dark:bg-ink-800">
              <div
                className={cx(
                  "h-full rounded-full transition-[width] duration-300 ease-out",
                  STAGE_BAR[i % STAGE_BAR.length],
                )}
                style={{ width: `${(Number(stage.total_amount) / maxStage) * 100}%` }}
              />
            </div>
            <p className="text-[10px] text-paper-400">
              idade média {stage.avg_age_days}d sem movimentação
            </p>
          </div>
        ))}
      </Panel>

      <Panel
        title="Previsão por mês"
        subtitle="Data de fechamento esperada dos negócios abertos"
        bodyClassName="space-y-2 p-3"
      >
        {metrics.forecast.length === 0 ? (
          <p className="py-4 text-[13px] text-paper-500">
            Nenhum negócio aberto tem data de fechamento definida.
          </p>
        ) : (
          metrics.forecast.map((entry) => (
            <div key={entry.month} className="space-y-1">
              <div className="flex items-baseline justify-between text-[12px]">
                <span className="font-medium text-ink dark:text-paper">{monthLabel(entry.month)}</span>
                <span className="tabular text-paper-600 dark:text-paper-400">
                  {compactCurrencyBRL(entry.amount)}
                  <span className="ml-1 text-brand-600 dark:text-brand-300">
                    ~{compactCurrencyBRL(entry.weighted)}
                  </span>
                </span>
              </div>
              {/* Barra dupla: total como trilho claro, ponderado preenchendo. */}
              <div className="relative h-2 overflow-hidden rounded-full bg-paper-100 dark:bg-ink-800">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-brand-200 transition-[width] duration-300 ease-out"
                  style={{ width: `${(Number(entry.amount) / maxForecast) * 100}%` }}
                />
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-brand-500 transition-[width] duration-300 ease-out"
                  style={{ width: `${(Number(entry.weighted) / maxForecast) * 100}%` }}
                />
              </div>
            </div>
          ))
        )}
      </Panel>

      <Panel
        title="Por responsável"
        subtitle={`Carteira aberta e ganhos nos últimos ${days} dias`}
        bodyClassName="divide-y divide-paper-200 dark:divide-ink-700"
      >
        {metrics.by_owner.length === 0 ? (
          <p className="px-3 py-4 text-[13px] text-paper-500">Nenhum negócio atribuído.</p>
        ) : (
          metrics.by_owner.map((owner) => (
            <div
              key={owner.owner_id ?? "none"}
              className="flex items-center gap-3 px-3 py-2 transition-colors duration-150 hover:bg-paper-50 dark:hover:bg-ink-800"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-ink dark:text-paper">
                  {owner.name}
                </span>
                <span className="block text-[11px] text-paper-500">
                  {owner.open_count} em aberto · {owner.won_count} ganhos
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-[13px] font-semibold tabular text-ink dark:text-paper">
                  {compactCurrencyBRL(owner.weighted_amount)}
                </span>
                <span className="block text-[10px] uppercase tracking-wide text-paper-500">
                  previsão
                </span>
              </span>
            </div>
          ))
        )}
      </Panel>

      <Panel
        title="Precisa de atenção"
        subtitle="Negócios vencidos e tarefas atrasadas"
        bodyClassName="divide-y divide-paper-200 dark:divide-ink-700"
      >
        {metrics.overdue_deals.length === 0 && metrics.overdue_activities.length === 0 ? (
          <p className="px-3 py-4 text-[13px] text-paper-500">Nada atrasado. Funil em dia.</p>
        ) : (
          <>
            {metrics.overdue_deals.map((deal) => (
              <div key={deal.id} className="flex items-center gap-3 px-3 py-2">
                <AlertTriangle className="size-3.5 shrink-0 text-warning" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-ink dark:text-paper">
                    {deal.title}
                  </span>
                  <span className="block truncate text-[11px] text-paper-500">
                    {deal.customer} · {deal.owner}
                  </span>
                </span>
                <Badge tone="warning">{deal.days_overdue}d vencido</Badge>
                <span className="shrink-0 text-[12px] tabular text-paper-600 dark:text-paper-400">
                  {compactCurrencyBRL(deal.amount)}
                </span>
              </div>
            ))}
            {metrics.overdue_activities.map((activity) => (
              <div key={activity.id} className="flex items-center gap-3 px-3 py-2">
                <ListTodo className="size-3.5 shrink-0 text-danger" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-ink dark:text-paper">
                    {activity.content}
                  </span>
                  <span className="block truncate text-[11px] text-paper-500">
                    {activity.deal_title}
                    {activity.assignee ? ` · ${activity.assignee}` : ""}
                  </span>
                </span>
                {activity.due_date && (
                  <Badge tone="danger">
                    {new Date(activity.due_date).toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                    })}
                  </Badge>
                )}
              </div>
            ))}
          </>
        )}
      </Panel>
    </div>
  )
}
