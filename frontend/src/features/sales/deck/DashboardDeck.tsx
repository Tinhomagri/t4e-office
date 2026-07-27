// Command Deck do Comercial.
//
// Superfície escura própria (ver deck.theme) porque é tela de leitura densa, não
// de edição — a quebra de tema é intencional e fica contida nesta rota.
//
// Motion: KPIs contam de 0 ao valor, painéis revelam ao entrar no viewport com
// 60ms de defasagem, faixas do funil escalam em X. Tudo é opacity/transform;
// com prefers-reduced-motion cada elemento nasce no estado final.
//
// Drill-down: clicar num estágio do funil filtra a tabela de negócios abaixo —
// e o filtro vale também para o que é exportado, senão o arquivo não bate com o
// que está na tela.
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import {
  AlertTriangle,
  Building2,
  ChevronDown,
  Download,
  FileSpreadsheet,
  FileText,
  Gauge,
  ListTodo,
  Image as ImageIcon,
  RefreshCw,
  Table2,
  Target,
  Timer,
  TrendingUp,
  Trophy,
  X,
} from "lucide-react"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"

import { useWorkspaceStore } from "@/features/workspace/workspace.store"
import { useWorkspaces } from "@/features/workspace/workspace.hooks"
import { cx } from "@/shared/ui/primitives"
import { toast } from "@/shared/ui/toast"

import { useDeals, useStages, useWorkspaceActivities } from "../sales.hooks"
import { usePipelineMetrics, type PipelineMetrics } from "../sales.metrics"
import { CountUp, DeckCard, KpiCard, RadialGauge } from "./DeckCard"
import { MARK, mark } from "./deck.marks"
import { flipRows, introTimeline, revealPanels, settleDeck, useGSAP } from "./deck.motion"
import { ActivityHeatmap, Empty, ForecastChart, FunnelFlow, OwnerRanking } from "./DeckCharts"
import {
  dealsSheet,
  forecastSheet,
  ownersSheet,
  stagesSheet,
  trendDelta,
  weeklyBuckets,
} from "./deck.data"
import { DECK, TONE, compact, full } from "./deck.theme"

const WINDOWS = [
  { value: "30", label: "30 dias" },
  { value: "90", label: "90 dias" },
  { value: "365", label: "12 meses" },
] as const

type WindowValue = (typeof WINDOWS)[number]["value"]

export function DashboardDeck() {
  const navigate = useNavigate()
  const reduce = useReducedMotion()
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const { data: workspaces } = useWorkspaces()
  const deckRef = useRef<HTMLDivElement>(null)

  const [days, setDays] = useState<WindowValue>("90")
  const [stageFilter, setStageFilter] = useState<string | null>(null)
  const [ownerFilter, setOwnerFilter] = useState<string | null>(null)

  const metricsQuery = usePipelineMetrics(workspaceId, Number(days))
  const { data: metrics, isLoading, isFetching, refetch } = metricsQuery
  const { data: deals } = useDeals(workspaceId)
  const { data: stages } = useStages(workspaceId)
  const { data: activities } = useWorkspaceActivities(workspaceId)

  const workspaceName = workspaces?.find((w) => w.id === workspaceId)?.name ?? "Workspace"

  const stageName = useMemo(() => {
    const map = new Map((stages ?? []).map((s) => [s.id, s.name]))
    return (id: string) => map.get(id) ?? "—"
  }, [stages])

  // Negócios visíveis = o que os filtros do deck deixaram passar. A tabela, os
  // KPIs derivados e a exportação usam esta mesma lista.
  const visibleDeals = useMemo(() => {
    let list = deals ?? []
    if (stageFilter) list = list.filter((d) => d.stage_id === stageFilter)
    if (ownerFilter) list = list.filter((d) => d.owner_id === ownerFilter)
    return list
  }, [deals, stageFilter, ownerFilter])

  // Séries semanais reais: negócios criados e valor ganho, na janela escolhida.
  const weeks = days === "30" ? 5 : days === "90" ? 13 : 26
  const created = useMemo(
    () => weeklyBuckets((deals ?? []).map((d) => ({ date: d.created_at, amount: Number(d.amount) })), weeks),
    [deals, weeks],
  )
  const won = useMemo(
    () =>
      weeklyBuckets(
        (deals ?? [])
          .filter((d) => d.won_at)
          .map((d) => ({ date: d.won_at, amount: Number(d.amount) })),
        weeks,
      ),
    [deals, weeks],
  )

  const sheets = useMemo(() => {
    if (!metrics) return []
    return [
      dealsSheet(visibleDeals, stageName),
      stagesSheet(metrics),
      ownersSheet(metrics),
      forecastSheet(metrics),
    ]
  }, [metrics, visibleDeals, stageName])

  const filtersActive = !!stageFilter || !!ownerFilter

  // ── Motion ────────────────────────────────────────────────────────────────
  // A timeline só pode rodar depois que os dados chegaram: enquanto `isLoading`
  // o que está no DOM é o esqueleto, e animar o esqueleto para depois trocar
  // pelo conteúdo real produziria duas entradas seguidas.
  const ready = !isLoading && !!metrics

  useGSAP(
    () => {
      const scope = deckRef.current
      if (!scope || !ready) return
      if (reduce) {
        settleDeck(scope)
        return
      }
      introTimeline(scope)
      revealPanels(scope)
    },
    { scope: deckRef, dependencies: [ready, reduce] },
  )

  // FLIP no drill-down: captura a posição das linhas antes do filtro mudar e
  // anima a diferença depois que o React repintou. Sem isto a tabela troca de
  // conteúdo sem aviso e o usuário não sabe se filtrou ou se recarregou.
  const playFlip = useRef<(() => void) | null>(null)
  const filterKey = `${stageFilter ?? ""}|${ownerFilter ?? ""}`

  const captureRows = () => {
    if (reduce || !deckRef.current) return
    playFlip.current = flipRows(deckRef.current)
  }

  useLayoutEffect(() => {
    playFlip.current?.()
    playFlip.current = null
  }, [filterKey])

  const selectStage = (id: string | null) => {
    captureRows()
    setStageFilter(id)
  }

  const selectOwner = (id: string | null) => {
    captureRows()
    setOwnerFilter(id)
  }

  if (!workspaceId) {
    return (
      <DeckShell innerRef={deckRef}>
        <Empty className="py-24">Selecione um workspace para ver o dashboard comercial.</Empty>
      </DeckShell>
    )
  }

  return (
    <DeckShell innerRef={deckRef}>
      {/* ── Barra de comando ─────────────────────────────────────────────── */}
      <header className="mb-4 flex flex-wrap items-center gap-2">
        {/* O deck é a página inicial do comercial — não há "voltar". O atalho
            leva ao pipeline, que é para onde se vai depois de ler o painel. */}
        <button
          onClick={() => navigate("/app/comercial/pipeline")}
          className="grid size-8 place-items-center rounded-lg border text-white/60 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300"
          style={{ borderColor: DECK.border }}
          title="Ir para o pipeline"
          aria-label="Ir para o pipeline"
        >
          <Target className="size-4" />
        </button>

        <div className="min-w-0">
          <h1
            {...mark(MARK.title)}
            className="truncate text-[15px] font-semibold tracking-[0.14em]"
            style={{ color: DECK.text }}
          >
            COMERCIAL · COMMAND DECK
          </h1>
          <p className="truncate text-[11px]" style={{ color: DECK.textDim }}>
            {workspaceName} · últimos {days === "365" ? "12 meses" : `${days} dias`}
          </p>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <SegmentedDark
            value={days}
            onChange={(v) => setDays(v as WindowValue)}
            options={WINDOWS.map((w) => ({ value: w.value, label: w.label }))}
          />
          <button
            onClick={() => refetch()}
            title="Atualizar dados"
            aria-label="Atualizar dados"
            className="grid size-8 place-items-center rounded-lg border text-white/60 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300"
            style={{ borderColor: DECK.border }}
          >
            <RefreshCw className={cx("size-3.5", isFetching && "animate-spin")} />
          </button>
          <ExportMenu deckRef={deckRef} sheets={sheets} subtitle={`${workspaceName} · ${days}d`} />
        </div>
      </header>

      {/* ── Chips de filtro ativo ────────────────────────────────────────── */}
      <AnimatePresence initial={false}>
        {filtersActive && (
          <motion.div
            initial={reduce ? false : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="mb-3 flex flex-wrap items-center gap-2"
          >
            <span className="text-[11px]" style={{ color: DECK.textDim }}>
              Filtrando:
            </span>
            {stageFilter && (
              <FilterChip label={stageName(stageFilter)} onClear={() => selectStage(null)} />
            )}
            {ownerFilter && (
              <FilterChip
                label={metrics?.by_owner.find((o) => o.owner_id === ownerFilter)?.name ?? "Responsável"}
                onClear={() => selectOwner(null)}
              />
            )}
            <span className="text-[11px] tabular" style={{ color: DECK.textFaint }}>
              {visibleDeals.length} negócio{visibleDeals.length === 1 ? "" : "s"}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {isLoading || !metrics ? (
        <DeckSkeleton />
      ) : (
        <div className="space-y-3">
          {/* ── KPIs ──────────────────────────────────────────────────────── */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              reveal="external"
              index={0}
              label="Valor no funil"
              value={Number(metrics.open.amount)}
              format={compact}
              icon={TrendingUp}
              hint={`${metrics.open.count} negócios abertos`}
              series={created.map((b) => b.amount)}
              delta={trendDelta(created.map((b) => b.amount))}
            />
            <KpiCard
              reveal="external"
              index={1}
              label="Previsão ponderada"
              value={Number(metrics.open.weighted_amount)}
              format={compact}
              icon={Gauge}
              hint="valor × probabilidade"
              tone="accent"
              series={created.map((b) => b.count)}
            />
            <KpiCard
              reveal="external"
              index={2}
              label="Ganho no período"
              value={Number(metrics.closed.won_amount)}
              format={compact}
              icon={Trophy}
              tone="positive"
              hint={`${metrics.closed.won_count} ganhos · ${metrics.closed.lost_count} perdidos`}
              series={won.map((b) => b.amount)}
              delta={trendDelta(won.map((b) => b.amount))}
            />
            <KpiCard
              reveal="external"
              index={3}
              label="Ciclo médio"
              value={metrics.closed.avg_cycle_days}
              format={(n) => `${n.toFixed(0)} d`}
              icon={Timer}
              tone={metrics.closed.avg_cycle_days > 60 ? "warning" : "accent"}
              hint="da criação até o ganho"
            />
          </div>

          {/* ── Funil + taxa de ganho ─────────────────────────────────────── */}
          <div className="grid gap-3 lg:grid-cols-[1.6fr_1fr]">
            <DeckCard
              reveal="external"
              {...mark(MARK.panel)}
              index={4}
              title="Fluxo do funil"
              subtitle="Largura = negócios na etapa · clique para filtrar o deck"
              exportName="funil-comercial"
            >
              <FunnelFlow
                metrics={metrics}
                selectedStage={stageFilter}
                onSelectStage={selectStage}
              />
            </DeckCard>

            <DeckCard reveal="external" {...mark(MARK.panel)} index={5} title="Conversão" subtitle={`Fechamentos dos últimos ${days} dias`}>
              <div className="flex flex-col items-center gap-4 py-2">
                <GaugeBlock
                  value={metrics.closed.win_rate}
                  wonCount={metrics.closed.won_count}
                  lostCount={metrics.closed.lost_count}
                />
                <dl className="grid w-full grid-cols-2 gap-2">
                  <Stat label="Ticket médio" value={Number(metrics.closed.avg_ticket)} />
                  <Stat label="Perdido" value={Number(metrics.closed.lost_amount)} tone="negative" />
                </dl>
              </div>
            </DeckCard>
          </div>

          {/* ── Previsão + ranking ────────────────────────────────────────── */}
          <div className="grid gap-3 lg:grid-cols-2">
            <DeckCard
              reveal="external"
              {...mark(MARK.panel)}
              index={6}
              title="Previsão por mês"
              subtitle="Fechamento esperado dos negócios abertos"
              exportName="previsao-comercial"
            >
              <ForecastChart metrics={metrics} />
            </DeckCard>

            <DeckCard
              reveal="external"
              {...mark(MARK.panel)}
              index={7}
              title="Ranking do time"
              subtitle="Previsão ponderada · clique para filtrar"
              exportName="ranking-comercial"
            >
              <OwnerRanking
                metrics={metrics}
                selectedOwner={ownerFilter}
                onSelectOwner={selectOwner}
              />
            </DeckCard>
          </div>

          {/* ── Heatmap + tabela ──────────────────────────────────────────── */}
          <DeckCard
            reveal="external"
            {...mark(MARK.panel)}
            index={8}
            title="Ritmo de atividade"
            subtitle="Interações registradas nas últimas 12 semanas"
            exportName="atividade-comercial"
          >
            <ActivityHeatmap activities={activities ?? []} />
          </DeckCard>

          <DeckCard
            reveal="external"
            {...mark(MARK.panel)}
            index={9}
            title="Precisa de atenção"
            subtitle="Negócios vencidos e tarefas atrasadas"
            bodyClassName="px-0 pb-0"
          >
            <AttentionList
              deals={metrics.overdue_deals}
              activities={metrics.overdue_activities}
            />
          </DeckCard>

          <DeckCard
            reveal="external"
            {...mark(MARK.panel)}
            index={10}
            title={stageFilter ? `Negócios · ${stageName(stageFilter)}` : "Negócios"}
            subtitle={
              filtersActive
                ? "Filtrado pelo funil — a exportação segue este recorte"
                : "Clique numa etapa do funil para filtrar"
            }
            bodyClassName="px-0 pb-0"
          >
            <DealsTable deals={visibleDeals} stageName={stageName} />
          </DeckCard>
        </div>
      )}
    </DeckShell>
  )
}

// ─── Casca escura ────────────────────────────────────────────────────────────

function DeckShell({
  children,
  innerRef,
}: {
  children: React.ReactNode
  innerRef: React.RefObject<HTMLDivElement>
}) {
  // O deck ocupa a área de conteúdo inteira; o -m compensa o padding do AppShell
  // para o fundo escuro sangrar até as bordas.
  return (
    <div
      className="-mx-4 -my-5 min-h-full px-4 py-5 sm:-mx-6 sm:-my-7 sm:px-6 sm:py-7"
      style={{ background: DECK.bg }}
    >
      {/* Malha de fundo: 1px a 6% de opacidade, puramente decorativa. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-[0.35]"
        style={{
          backgroundImage: `linear-gradient(${DECK.grid} 1px, transparent 1px), linear-gradient(90deg, ${DECK.grid} 1px, transparent 1px)`,
          backgroundSize: "40px 40px",
          maskImage: "radial-gradient(ellipse at 50% 0%, black, transparent 75%)",
        }}
      />
      <div ref={innerRef} className="relative">
        {children}
      </div>
    </div>
  )
}

// ─── Controles ───────────────────────────────────────────────────────────────

function SegmentedDark({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  const reduce = useReducedMotion()
  return (
    <div
      role="radiogroup"
      aria-label="Janela de análise"
      className="flex items-center gap-0.5 rounded-lg border p-0.5"
      style={{ borderColor: DECK.border }}
    >
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cx(
              "relative rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300",
              active ? "text-white" : "text-white/50 hover:text-white/80",
            )}
          >
            {active && (
              <motion.span
                layoutId="deck-window"
                transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 400, damping: 30 }}
                className="absolute inset-0 -z-10 rounded-md bg-white/10"
              />
            )}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span
      className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]"
      style={{ borderColor: DECK.borderHi, color: DECK.text }}
    >
      {label}
      <button
        onClick={onClear}
        aria-label={`Remover filtro ${label}`}
        className="grid size-4 place-items-center rounded-full text-white/50 transition-colors hover:bg-white/15 hover:text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-blue-300"
      >
        <X className="size-3" />
      </button>
    </span>
  )
}

function ExportMenu({
  deckRef,
  sheets,
  subtitle,
}: {
  deckRef: React.RefObject<HTMLDivElement>
  sheets: ReturnType<typeof dealsSheet>[]
  subtitle: string
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const reduce = useReducedMotion()

  // Esc fecha — teclado precisa sair do menu sem mouse.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  const run = async (id: string, fn: () => Promise<void> | void) => {
    setBusy(id)
    try {
      await fn()
      setOpen(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível exportar.")
    } finally {
      setBusy(null)
    }
  }

  const items = [
    {
      id: "csv",
      label: "CSV (negócios)",
      hint: "abre no Excel-BR",
      icon: Table2,
      run: async () => {
        const { sheetToCsv } = await import("./deck.export")
        if (sheets[0]) sheetToCsv(sheets[0])
      },
    },
    {
      id: "xlsx",
      label: "Excel .xlsx",
      hint: `${sheets.length} abas`,
      icon: FileSpreadsheet,
      run: async () => {
        const { sheetsToXlsx } = await import("./deck.export")
        await sheetsToXlsx(sheets)
      },
    },
    {
      id: "png",
      label: "PNG do deck",
      hint: "imagem única",
      icon: ImageIcon,
      run: async () => {
        const { elementToPng } = await import("./deck.export")
        if (deckRef.current) await elementToPng(deckRef.current, "comercial-dashboard")
      },
    },
    {
      id: "pdf",
      label: "PDF do relatório",
      hint: "A4 paisagem",
      icon: FileText,
      run: async () => {
        const { elementToPdf } = await import("./deck.export")
        if (deckRef.current)
          await elementToPdf(deckRef.current, { title: "Comercial · Dashboard", subtitle })
      },
    },
  ]

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300"
        style={{ borderColor: DECK.border }}
      >
        <Download className="size-3.5" />
        Exportar
        <ChevronDown className={cx("size-3 transition-transform", open && "rotate-180")} />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <motion.div
              role="menu"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
              transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
              className="absolute right-0 top-10 z-20 w-56 origin-top-right rounded-xl border p-1.5 shadow-pop"
              style={{ background: DECK.surfaceHi, borderColor: DECK.borderHi }}
            >
              {items.map((item) => (
                <button
                  key={item.id}
                  role="menuitem"
                  disabled={busy != null}
                  onClick={() => run(item.id, item.run)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-white/[0.07] disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-300"
                >
                  <item.icon
                    className={cx("size-4 shrink-0", busy === item.id && "animate-pulse")}
                    style={{ color: DECK.textDim }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12px]" style={{ color: DECK.text }}>
                      {item.label}
                    </span>
                    <span className="block text-[10px]" style={{ color: DECK.textFaint }}>
                      {busy === item.id ? "gerando…" : item.hint}
                    </span>
                  </span>
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Blocos menores ──────────────────────────────────────────────────────────

/**
 * "Precisa de atenção": negócios vencidos e tarefas atrasadas.
 *
 * Veio da antiga Visão geral, que era a única tela a mostrar isto. Com o deck
 * virando a página inicial do comercial, o painel migrou para cá vestindo o
 * tema escuro — a lista de pendências é justamente o que não pode ficar numa
 * segunda tela que ninguém abre.
 */
function AttentionList({
  deals,
  activities,
}: {
  deals: PipelineMetrics["overdue_deals"]
  activities: PipelineMetrics["overdue_activities"]
}) {
  if (deals.length === 0 && activities.length === 0) {
    return (
      <p className="px-4 py-5 text-[13px]" style={{ color: DECK.textDim }}>
        Nada atrasado. Funil em dia.
      </p>
    )
  }

  return (
    <ul className="divide-y" style={{ borderColor: DECK.border }}>
      {deals.map((deal) => (
        <li
          key={deal.id}
          className="flex items-center gap-3 px-4 py-2"
          style={{ borderColor: DECK.border }}
        >
          <AlertTriangle className="size-3.5 shrink-0" style={{ color: TONE.warning }} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px]" style={{ color: DECK.text }}>
              {deal.title}
            </span>
            <span className="block truncate text-[11px]" style={{ color: DECK.textDim }}>
              {deal.customer} · {deal.owner}
            </span>
          </span>
          <DeckBadge tone="warning">{deal.days_overdue}d vencido</DeckBadge>
          <span className="shrink-0 text-[12px] tabular" style={{ color: DECK.textDim }}>
            {compact(Number(deal.amount))}
          </span>
        </li>
      ))}
      {activities.map((activity) => (
        <li
          key={activity.id}
          className="flex items-center gap-3 px-4 py-2"
          style={{ borderColor: DECK.border }}
        >
          <ListTodo className="size-3.5 shrink-0" style={{ color: TONE.negative }} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px]" style={{ color: DECK.text }}>
              {activity.content}
            </span>
            <span className="block truncate text-[11px]" style={{ color: DECK.textDim }}>
              {activity.deal_title}
              {activity.assignee ? ` · ${activity.assignee}` : ""}
            </span>
          </span>
          {activity.due_date && (
            <DeckBadge tone="negative">
              {new Date(activity.due_date).toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
              })}
            </DeckBadge>
          )}
        </li>
      ))}
    </ul>
  )
}

/** Selo do deck: o Badge do design system é claro demais para esta superfície. */
function DeckBadge({
  tone,
  children,
}: {
  tone: keyof typeof TONE
  children: React.ReactNode
}) {
  const color = TONE[tone]
  return (
    <span
      className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium tabular"
      style={{ background: `${color}1F`, color }}
    >
      {children}
    </span>
  )
}

function GaugeBlock({
  value,
  wonCount,
  lostCount,
}: {
  value: number
  wonCount: number
  lostCount: number
}) {
  return (
    <div className="flex items-center gap-4">
      <RadialGauge
        reveal="external"
        value={value}
        label="Taxa de ganho"
        color={value >= 50 ? TONE.positive : TONE.warning}
      />
      <div className="text-[11px] leading-relaxed" style={{ color: DECK.textDim }}>
        <p>
          <span className="font-semibold tabular" style={{ color: TONE.positive }}>
            {wonCount}
          </span>{" "}
          ganhos
        </p>
        <p>
          <span className="font-semibold tabular" style={{ color: TONE.negative }}>
            {lostCount}
          </span>{" "}
          perdidos
        </p>
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  tone = "accent",
}: {
  label: string
  value: number
  tone?: keyof typeof TONE
}) {
  return (
    <div className="rounded-lg border p-2" style={{ borderColor: DECK.border }}>
      <dt className="text-[10px] uppercase tracking-[0.1em]" style={{ color: DECK.textFaint }}>
        {label}
      </dt>
      <dd className="mt-0.5 text-[15px] font-semibold tabular" style={{ color: TONE[tone] }}>
        <CountUp value={value} format={compact} />
      </dd>
    </div>
  )
}

function DealsTable({
  deals,
  stageName,
}: {
  deals: { id: string; title: string; customer_name: string; stage_id: string; amount: string; probability: number; expected_close_date: string | null }[]
  stageName: (id: string) => string
}) {
  if (deals.length === 0) return <Empty>Nenhum negócio neste recorte.</Empty>

  return (
    <div className="max-h-80 overflow-auto scrollbar-slim">
      <table className="w-full text-left text-[12px]">
        <thead className="sticky top-0 z-10" style={{ background: DECK.surface }}>
          <tr style={{ color: DECK.textFaint }}>
            <Th>Negócio</Th>
            <Th>Cliente</Th>
            <Th>Estágio</Th>
            <Th className="text-right">Valor</Th>
            <Th className="text-right">Prob.</Th>
            <Th className="text-right">Fechamento</Th>
          </tr>
        </thead>
        <tbody>
          {deals.map((d) => (
            <tr
              key={d.id}
              // `data-flip-id` dá identidade estável à linha entre um filtro e
              // outro — é assim que o FLIP sabe que a linha se moveu em vez de
              // ter sumido e nascido outra.
              data-flip-id={d.id}
              {...mark(MARK.row)}
              className="border-t transition-colors hover:bg-white/[0.04]"
              style={{ borderColor: DECK.border }}
            >
              <Td className="max-w-[220px] truncate font-medium" style={{ color: DECK.text }}>
                {d.title}
              </Td>
              <Td className="max-w-[160px] truncate" style={{ color: DECK.textDim }}>
                <span className="flex items-center gap-1.5">
                  <Building2 className="size-3 shrink-0 opacity-60" />
                  {d.customer_name}
                </span>
              </Td>
              <Td style={{ color: DECK.textDim }}>{stageName(d.stage_id)}</Td>
              <Td className="text-right tabular" style={{ color: DECK.text }}>
                {full(Number(d.amount))}
              </Td>
              <Td className="text-right tabular" style={{ color: DECK.textDim }}>
                {d.probability}%
              </Td>
              <Td className="text-right tabular" style={{ color: DECK.textDim }}>
                {d.expected_close_date
                  ? new Date(`${d.expected_close_date}T12:00:00`).toLocaleDateString("pt-BR")
                  : "—"}
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={cx(
        "px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.1em] first:pl-4 last:pr-4",
        className,
      )}
    >
      {children}
    </th>
  )
}

function Td({
  children,
  className,
  style,
}: {
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <td className={cx("px-3 py-2 first:pl-4 last:pr-4", className)} style={style}>
      {children}
    </td>
  )
}

function DeckSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Carregando dashboard">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="h-[124px] animate-pulse rounded-xl border"
            style={{ background: DECK.surface, borderColor: DECK.border }}
          />
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-[1.6fr_1fr]">
        <div
          className="h-64 animate-pulse rounded-xl border"
          style={{ background: DECK.surface, borderColor: DECK.border }}
        />
        <div
          className="h-64 animate-pulse rounded-xl border"
          style={{ background: DECK.surface, borderColor: DECK.border }}
        />
      </div>
    </div>
  )
}
