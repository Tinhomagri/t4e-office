// Shell do space Comercial. A navegação entre seções mora na sidebar (space
// "Comercial"), então aqui ficam só as coisas que valem para todas as telas:
// cabeçalho, janela de análise, barra de KPIs e a faixa de alertas — quem abre
// "Clientes" continua vendo que há negócio vencido no funil.
import { motion, useReducedMotion } from "framer-motion"
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  FileText,
  Gauge,
  LayoutDashboard,
  ListTodo,
  MessagesSquare,
  Sparkles,
  Target,
  Timer,
  TrendingUp,
  Trophy,
  UserSearch,
} from "lucide-react"
import { useMemo } from "react"
import { Outlet, useLocation, useNavigate } from "react-router-dom"

import { useWorkspaceStore } from "@/features/workspace/workspace.store"
import { EASE } from "@/shared/lib/motion"
import {
  type CommandAction,
  MOD_LABEL,
  MetricStrip,
  MetricTile,
  SegmentedControl,
  compactCurrencyBRL,
  currencyBRL,
  useCommandPalette,
  usePersistedState,
} from "@/shared/ui/command-center"
import { Badge, Button, EmptyState, Kbd, PageHeader, Skeleton, cx } from "@/shared/ui/primitives"

import { usePipelineMetrics } from "./sales.metrics"

const WINDOWS = [
  { value: "30", label: "30 dias" },
  { value: "90", label: "90 dias" },
  { value: "365", label: "12 meses" },
] as const

const SECTIONS: { to: string; label: string; icon: typeof Target }[] = [
  // Mesmo rótulo da sidebar: dois nomes para a mesma tela confundem.
  { to: "/app/comercial/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/app/comercial/atendimento", label: "Atendimento", icon: MessagesSquare },
  { to: "/app/comercial/leads", label: "Leads", icon: UserSearch },
  { to: "/app/comercial/pipeline", label: "Pipeline", icon: Target },
  { to: "/app/comercial/clientes", label: "Clientes", icon: Building2 },
  { to: "/app/comercial/atividades", label: "Atividades", icon: ListTodo },
  { to: "/app/comercial/propostas", label: "Propostas", icon: FileText },
  { to: "/app/comercial/metas", label: "Metas & forecast", icon: Trophy },
]

export function SalesLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const reduce = useReducedMotion()
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
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
      ...SECTIONS.map((s) => ({
        id: `go-${s.to}`,
        label: `Ir para ${s.label}`,
        group: "Navegação",
        icon: <s.icon className="size-4" />,
        run: () => navigate(s.to),
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
        run: () => navigate("/app/comercial/dashboard"),
      },
    ],
    [alerts.deals, alerts.activities, setDays, navigate],
  )

  const { palette, setOpen } = useCommandPalette(actions)

  const current = SECTIONS.find((s) =>
    location.pathname === s.to || location.pathname.startsWith(`${s.to}/`),
  )

  // O deck é uma superfície fechada: tem o próprio seletor de período, os
  // próprios KPIs e já absorveu o painel de atrasados. Repetir tudo isso acima
  // dele empilhava três barras de controle dizendo a mesma coisa.
  const isDeck = location.pathname.startsWith("/app/comercial/dashboard")

  return (
    // Sem gap no deck: ele é a única superfície da rota e compensa o padding do
    // AppShell por conta própria — qualquer espaço extra aqui vira uma faixa
    // clara acima do fundo escuro.
    <div className={cx("flex flex-col", !isDeck && "gap-4")}>
      {palette}

      {/* O deck traz o próprio cabeçalho e sangra o fundo escuro com margem
          negativa — renderizar um PageHeader acima dele fazia o deck subir por
          cima do subtítulo e comer o texto. Ele também já tem seu seletor de
          período e sua paleta de comandos, então aqui não sobra nada a mostrar. */}
      {!isDeck && (
        <PageHeader
          title={current?.label ?? "Comercial"}
          subtitle="Funil de vendas, clientes e follow-ups do time."
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
            layoutId="sales-window"
            size="sm"
            ariaLabel="Janela de análise"
            value={days}
            onChange={setDays}
            options={WINDOWS.map((w) => ({ value: w.value, label: w.label }))}
          />
        </PageHeader>
      )}

      {!workspaceId ? (
        <EmptyState
          title="Selecione um workspace"
          description="O funil comercial é organizado por workspace."
        />
      ) : (
        <>
          {isDeck ? null : isLoading ? (
            <Skeleton className="h-24 rounded-lg" />
          ) : metrics ? (
            <MetricStrip>
              <MetricTile
                label="Negócios abertos"
                value={String(metrics.open.count)}
                rawValue={metrics.open.count}
                icon={<Target className="size-3.5" />}
                hint="Abrir o pipeline"
                onClick={() => navigate("/app/comercial/pipeline")}
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

          {!isDeck && (alerts.deals > 0 || alerts.activities > 0 || alerts.stale > 0) && (
            <button
              type="button"
              onClick={() => navigate("/app/comercial/dashboard")}
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

          {/* Troca de seção: fade curto + 8px. A sidebar já deu o contexto. */}
          <motion.div
            key={location.pathname}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: EASE }}
          >
            <Outlet context={{ workspaceId }} />
          </motion.div>
        </>
      )}
    </div>
  )
}
