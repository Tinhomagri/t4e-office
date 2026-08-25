// Painel de Tráfego — investimento em anúncios (Meta Marketing API) e
// conciliação com as vendas fechadas. Porte do módulo Tráfego do T4E OS:
// mesmos sete relatórios, mesma regra de período (vendas ignora o filtro,
// de propósito — ver traffic.api.ts).
import { useMemo } from "react"
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  AlertTriangle,
  DollarSign,
  Eye,
  MousePointerClick,
  RefreshCw,
  Sparkles,
  Target,
  TrendingUp,
  Users,
} from "lucide-react"

import {
  previewUrl,
  thumbnailUrl,
  useTrafficAds,
  useTrafficAudience,
  useTrafficCampaigns,
  useTrafficFunnel,
  useTrafficOverview,
  useTrafficSales,
  useTrafficSeries,
  type TrafficFilter,
} from "@/features/marketing/traffic.api"
import type {
  AdWithSales,
  AudienceProfile,
  Funnel,
  SalesReconciliation,
  TrafficAd,
  TrafficCampaign,
  TrafficOverview,
} from "@/features/marketing/traffic.types"
import {
  MOD_LABEL,
  MetricStrip,
  MetricTile,
  Panel,
  SegmentedControl,
  compactNumber,
  useCommandPalette,
  useHotkey,
  usePersistedState,
  type CommandAction,
} from "@/shared/ui/command-center"
import { Badge, Button, EmptyState, Kbd, PageHeader, Skeleton, cx } from "@/shared/ui/primitives"

type Tab = "geral" | "anuncios" | "campanhas" | "publico" | "funil" | "vendas"

const TABS: { value: Tab; label: string }[] = [
  { value: "geral", label: "Geral" },
  { value: "anuncios", label: "Anúncios" },
  { value: "campanhas", label: "Campanhas" },
  { value: "publico", label: "Público" },
  { value: "funil", label: "Funil" },
  { value: "vendas", label: "Vendas" },
]

const PERIODS = [
  { value: "7", label: "7 dias" },
  { value: "30", label: "30 dias" },
  { value: "90", label: "90 dias" },
] as const

function currency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
}

function rangeFor(days: string): TrafficFilter {
  const until = new Date()
  const since = new Date(until)
  since.setDate(until.getDate() - (Number(days) - 1))
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  return { since: iso(since), until: iso(until) }
}

function shortDate(iso: string): string {
  const [, m, d] = iso.split("-")
  return `${d}/${m}`
}

function configErrorMessage(error: unknown): string | null {
  const e = error as { response?: { status?: number; data?: { error?: string } } } | undefined
  if (e?.response?.status !== 400) return null
  return e.response?.data?.error ?? "O módulo Tráfego não está configurado."
}

export function TrafficPage() {
  const [tab, setTab] = usePersistedState<Tab>("traffic:tab", "geral")
  const [days, setDays] = usePersistedState<"7" | "30" | "90">("traffic:days", "30")
  const filter = useMemo(() => rangeFor(days), [days])

  const overview = useTrafficOverview(filter)
  const series = useTrafficSeries(filter)
  const ads = useTrafficAds(filter)
  const campaigns = useTrafficCampaigns(filter)
  const audience = useTrafficAudience(filter)
  const funnel = useTrafficFunnel(filter)
  const sales = useTrafficSales()

  const queries = [overview, series, ads, campaigns, audience, funnel, sales]
  const loading = queries.some((q) => q.isLoading)
  const configError = queries.map((q) => configErrorMessage(q.error)).find(Boolean) ?? null

  const refreshAll = () => {
    for (const q of queries) void q.refetch()
  }
  useHotkey("mod+r", refreshAll)

  const actions = useMemo<CommandAction[]>(
    () => [
      {
        id: "refresh",
        label: "Atualizar tráfego",
        icon: <RefreshCw className="size-4" />,
        shortcut: `${MOD_LABEL}R`,
        run: refreshAll,
      },
      ...TABS.map((t) => ({
        id: `tab-${t.value}`,
        label: `Ir para ${t.label}`,
        group: "Aba",
        icon: <TrendingUp className="size-4" />,
        run: () => setTab(t.value),
      })),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setTab],
  )
  const { palette, setOpen } = useCommandPalette(actions)

  const chartData = useMemo(
    () => (series.data?.data ?? []).map((point) => ({ ...point, label: shortDate(point.date) })),
    [series.data],
  )

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4 p-4 sm:p-6">
      {palette}

      <PageHeader
        eyebrow="Marketing"
        title="Tráfego"
        subtitle="Investimento em anúncios (Meta Ads) e conciliação com as vendas fechadas."
      >
        <Button variant="outline" size="sm" icon={<Sparkles className="size-3.5" />} onClick={() => setOpen(true)}>
          Comandos <Kbd>{MOD_LABEL}K</Kbd>
        </Button>
        <SegmentedControl
          layoutId="traffic-period"
          size="sm"
          ariaLabel="Período"
          value={days}
          onChange={setDays}
          options={PERIODS.map((p) => ({ value: p.value, label: p.label }))}
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

      {configError ? (
        <EmptyState
          icon={<AlertTriangle className="size-5" />}
          title="Tráfego não configurado"
          description={configError}
        />
      ) : (
        <>
          <SegmentedControl
            layoutId="traffic-tab"
            ariaLabel="Seção"
            value={tab}
            onChange={setTab}
            options={TABS.map((t) => ({ value: t.value, label: t.label }))}
          />

          {tab === "geral" && (
            <GeralTab
              loading={overview.isLoading || series.isLoading}
              overview={overview.data}
              chartData={chartData}
            />
          )}
          {tab === "anuncios" && <AnunciosTab loading={ads.isLoading} ads={ads.data?.data ?? []} />}
          {tab === "campanhas" && (
            <CampanhasTab loading={campaigns.isLoading} campanhas={campaigns.data?.data ?? []} />
          )}
          {tab === "publico" && <PublicoTab loading={audience.isLoading} perfil={audience.data} />}
          {tab === "funil" && <FunilTab loading={funnel.isLoading} funil={funnel.data} />}
          {tab === "vendas" && <VendasTab loading={sales.isLoading} vendas={sales.data} />}
        </>
      )}
    </div>
  )
}

// ── Geral ─────────────────────────────────────────────────────────────────

function GeralTab({
  loading,
  overview,
  chartData,
}: {
  loading: boolean
  overview: TrafficOverview | undefined
  chartData: { label: string; spend: number; leads: number }[]
}) {
  if (loading && !overview) return <Skeleton className="h-64 rounded-lg" />
  if (!overview) return <EmptyState title="Sem dados" description="Nenhum investimento no período." />

  return (
    <>
      <MetricStrip>
        <MetricTile label="Investimento" value={currency(overview.spend)} tone="brand" icon={<DollarSign className="size-3.5" />} />
        <MetricTile label="Impressões" value={compactNumber(overview.impressions)} icon={<Eye className="size-3.5" />} />
        <MetricTile label="Cliques" value={compactNumber(overview.clicks)} icon={<MousePointerClick className="size-3.5" />} />
        <MetricTile label="CTR" value={`${overview.ctr.toFixed(2)}%`} icon={<Target className="size-3.5" />} />
        <MetricTile label="Leads" value={compactNumber(overview.leads)} tone="success" icon={<Users className="size-3.5" />} />
        <MetricTile label="CPL" value={currency(overview.cpl)} icon={<TrendingUp className="size-3.5" />} />
      </MetricStrip>

      <Panel title="Investimento por dia" subtitle={`${chartData.length} dias`} bodyClassName="p-3">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
              <defs>
                <linearGradient id="traffic-spend-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0C66E4" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#0C66E4" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#DCDFE4" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#626F86" }} tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis tick={{ fontSize: 11, fill: "#626F86" }} tickLine={false} axisLine={false} tickFormatter={compactNumber} width={52} />
              <Tooltip
                cursor={{ stroke: "#B3B9C4", strokeWidth: 1 }}
                contentStyle={{ borderRadius: 6, border: "1px solid #DCDFE4", fontSize: 12 }}
                formatter={(value) => [Number(value ?? 0).toLocaleString("pt-BR"), "Investimento"]}
              />
              <Area type="monotone" dataKey="spend" stroke="#0C66E4" strokeWidth={2} fill="url(#traffic-spend-fill)" dot={false} activeDot={{ r: 3 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Panel>
    </>
  )
}

// ── Anúncios ──────────────────────────────────────────────────────────────

function AnunciosTab({ loading, ads }: { loading: boolean; ads: TrafficAd[] }) {
  if (loading && ads.length === 0) return <Skeleton className="h-64 rounded-lg" />
  if (ads.length === 0) return <EmptyState title="Nenhum anúncio no período" />

  return (
    <Panel title="Anúncios" subtitle={`${ads.length} anúncio${ads.length === 1 ? "" : "s"}`}>
      <div className="divide-y divide-paper-200 dark:divide-ink-700">
        {ads.map((ad) => (
          <div key={ad.id} className="flex items-start gap-3 px-3 py-2.5">
            {ad.temMiniatura ? (
              <img
                src={thumbnailUrl(ad.id)}
                alt=""
                className="size-14 shrink-0 rounded-md object-cover"
                loading="lazy"
              />
            ) : (
              <div className="size-14 shrink-0 rounded-md bg-paper-100 dark:bg-ink-800" />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-[13px] font-medium text-ink dark:text-paper">{ad.name || "—"}</p>
                {ad.status && <Badge tone={ad.status === "ACTIVE" ? "success" : "neutral"}>{ad.status}</Badge>}
              </div>
              <p className="mt-0.5 text-[11px] tabular text-paper-400">
                {currency(ad.spend)} · {compactNumber(ad.impressions)} impressões · {compactNumber(ad.clicks)} cliques ·{" "}
                {ad.leads} leads · CPL {currency(ad.cpl)}
              </p>
              {ad.clientes > 0 && (
                <p className="mt-0.5 text-[11px] tabular text-success">
                  {ad.clientes} cliente{ad.clientes > 1 ? "s" : ""} · CAC {currency(ad.cac)}
                  {ad.valorPorCliente !== null && ` · ticket ${currency(ad.valorPorCliente)}`}
                  {ad.fechamentoDias !== null && ` · fecha em ${ad.fechamentoDias}d`}
                </p>
              )}
            </div>
            <a
              href={previewUrl(ad.id)}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 text-[11px] text-brand-600 underline-offset-2 hover:underline dark:text-brand-300"
            >
              Prévia
            </a>
          </div>
        ))}
      </div>
    </Panel>
  )
}

// ── Campanhas ─────────────────────────────────────────────────────────────

function CampanhasTab({ loading, campanhas }: { loading: boolean; campanhas: TrafficCampaign[] }) {
  if (loading && campanhas.length === 0) return <Skeleton className="h-64 rounded-lg" />
  if (campanhas.length === 0) return <EmptyState title="Nenhuma campanha no período" />

  return (
    <Panel title="Campanhas" subtitle={`${campanhas.length} campanha${campanhas.length === 1 ? "" : "s"}`}>
      <div className="divide-y divide-paper-200 dark:divide-ink-700">
        {campanhas.map((c) => (
          <div key={c.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
            <p className="min-w-0 flex-1 truncate text-[13px] text-ink dark:text-paper">{c.name || "—"}</p>
            <p className="shrink-0 text-[11px] tabular text-paper-400">
              {currency(c.spend)} · {c.leads} leads · CPL {currency(c.cpl)}
            </p>
          </div>
        ))}
      </div>
    </Panel>
  )
}

// ── Público ───────────────────────────────────────────────────────────────

function SegmentList({ title, items }: { title: string; items: { key: string; spend: number; leads: number; cpl: number }[] }) {
  return (
    <Panel title={title}>
      <div className="divide-y divide-paper-200 dark:divide-ink-700">
        {items.map((item) => (
          <div key={item.key} className="flex items-center justify-between gap-3 px-3 py-2">
            <span className="text-[13px] text-ink dark:text-paper">{item.key}</span>
            <span className="text-[11px] tabular text-paper-400">
              {currency(item.spend)} · {item.leads} leads · CPL {currency(item.cpl)}
            </span>
          </div>
        ))}
        {items.length === 0 && <p className="px-3 py-4 text-[12px] text-paper-400">Sem dados no período.</p>}
      </div>
    </Panel>
  )
}

function PublicoTab({ loading, perfil }: { loading: boolean; perfil: AudienceProfile | undefined }) {
  if (loading && !perfil) return <Skeleton className="h-64 rounded-lg" />
  if (!perfil) return <EmptyState title="Sem dados de público" />

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <SegmentList title="Gênero" items={perfil.genero} />
      <SegmentList title="Faixa etária" items={perfil.idade} />
      <SegmentList title="Dispositivo" items={perfil.dispositivo} />
    </div>
  )
}

// ── Funil ─────────────────────────────────────────────────────────────────

function FunilTab({ loading, funil }: { loading: boolean; funil: Funnel | undefined }) {
  if (loading && !funil) return <Skeleton className="h-64 rounded-lg" />
  if (!funil) return <EmptyState title="Sem dados de funil" />

  return (
    <>
      <MetricStrip>
        <MetricTile label="Leads no período" value={compactNumber(funil.total)} />
        <MetricTile label="Orçando" value={compactNumber(funil.orcando)} />
        <MetricTile label="Clientes" value={compactNumber(funil.clientes)} tone="success" />
        <MetricTile label="CAC real" value={funil.cacReal !== null ? currency(funil.cacReal) : "—"} />
        <MetricTile label="Com e-mail" value={compactNumber(funil.comContato.email)} />
        <MetricTile label="Com telefone" value={compactNumber(funil.comContato.telefone)} />
      </MetricStrip>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Etapas">
          <div className="divide-y divide-paper-200 dark:divide-ink-700">
            {funil.stages.map((s) => (
              <div key={s.stage} className="flex items-center justify-between px-3 py-2">
                <span className="text-[13px] text-ink dark:text-paper">{s.stage}</span>
                <span className="text-[12px] tabular text-paper-400">{s.count}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Por UF" subtitle={`${funil.semLocal} sem local identificado`}>
          <div className="divide-y divide-paper-200 dark:divide-ink-700">
            {funil.byUF.map((item) => (
              <div key={item.uf} className="flex items-center justify-between px-3 py-2">
                <span className="text-[13px] text-ink dark:text-paper">{item.uf}</span>
                <span className="text-[12px] tabular text-paper-400">{item.count}</span>
              </div>
            ))}
            {funil.byUF.length === 0 && (
              <p className="px-3 py-4 text-[12px] text-paper-400">Nenhum lead com localização identificada.</p>
            )}
          </div>
        </Panel>
      </div>

      <Panel title="Por anúncio (utm_content)">
        <div className="divide-y divide-paper-200 dark:divide-ink-700">
          {funil.byAd.map((item) => (
            <div key={item.name} className="flex items-center justify-between px-3 py-2">
              <span className="truncate text-[13px] text-ink dark:text-paper">{item.name}</span>
              <span className="text-[12px] tabular text-paper-400">{item.count}</span>
            </div>
          ))}
          {funil.byAd.length === 0 && <p className="px-3 py-4 text-[12px] text-paper-400">Sem leads casados a um anúncio.</p>}
        </div>
      </Panel>
    </>
  )
}

// ── Vendas ────────────────────────────────────────────────────────────────

function AdSalesRow({ ad }: { ad: AdWithSales }) {
  return (
    <div className="flex items-start justify-between gap-3 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-ink dark:text-paper">{ad.name}</p>
        <p className="mt-0.5 text-[11px] tabular text-paper-400">
          {ad.vendas} venda{ad.vendas > 1 ? "s" : ""} · {currency(ad.faturamento)} · ticket {currency(ad.ticket)}
          {ad.dias !== null && ` · fecha em ${ad.dias}d`}
          {ad.viaNome > 0 && ` · ${ad.viaNome} via nome`}
        </p>
      </div>
      <div className="shrink-0 text-right text-[11px] tabular text-paper-400">
        {ad.spend > 0 ? (
          <>
            <p>gasto {currency(ad.spend)}</p>
            <p>ROAS {ad.roas?.toFixed(2) ?? "—"}</p>
          </>
        ) : (
          <p>sem gasto casado</p>
        )}
      </div>
    </div>
  )
}

function VendasTab({ loading, vendas }: { loading: boolean; vendas: SalesReconciliation | undefined }) {
  if (loading && !vendas) return <Skeleton className="h-64 rounded-lg" />
  if (!vendas) return <EmptyState title="Sem dados de vendas" />

  return (
    <>
      <MetricStrip>
        <MetricTile label="Faturamento total" value={currency(vendas.total)} tone="brand" />
        <MetricTile label="Vendas" value={compactNumber(vendas.vendas)} />
        <MetricTile label="Ticket médio" value={currency(vendas.ticket)} />
        <MetricTile label="Tempo médio de fechamento" value={vendas.tempoMedio !== null ? `${vendas.tempoMedio}d` : "—"} />
        <MetricTile
          label="ROAS (anúncios com venda)"
          value={vendas.resumoAds.roas !== null ? vendas.resumoAds.roas.toFixed(2) : "—"}
        />
        <MetricTile
          label="ROAS (conta inteira)"
          value={vendas.resumoAds.roasConta !== null ? vendas.resumoAds.roasConta.toFixed(2) : "—"}
        />
      </MetricStrip>

      {vendas.naoAchado.vendas > 0 && (
        <div className={cx("flex items-center gap-2.5 rounded-lg border px-3 py-2 text-[13px]", "border-warning/40 bg-warning/10")}>
          <AlertTriangle className="size-4 shrink-0 text-warning" />
          <span>
            {vendas.naoAchado.vendas} venda{vendas.naoAchado.vendas > 1 ? "s" : ""} ({currency(vendas.naoAchado.faturamento)}) não
            casou{vendas.naoAchado.vendas > 1 ? "aram" : ""} com nenhum lead — telefone/nome não bateu com a planilha histórica.
          </span>
        </div>
      )}

      <Panel title="Por anúncio" subtitle={`${vendas.anuncios.length} anúncio${vendas.anuncios.length === 1 ? "" : "s"} com venda`}>
        <div className="divide-y divide-paper-200 dark:divide-ink-700">
          {vendas.anuncios.map((ad) => (
            <AdSalesRow key={ad.name} ad={ad} />
          ))}
          {vendas.anuncios.length === 0 && <p className="px-3 py-4 text-[12px] text-paper-400">Nenhuma venda casada a um anúncio ainda.</p>}
        </div>
      </Panel>

      <Panel title="Por origem">
        <div className="divide-y divide-paper-200 dark:divide-ink-700">
          {vendas.origens.map((o) => (
            <div key={o.origem} className="flex items-center justify-between px-3 py-2">
              <span className="text-[13px] text-ink dark:text-paper">{o.origem}</span>
              <span className="text-[11px] tabular text-paper-400">
                {o.vendas} venda{o.vendas > 1 ? "s" : ""} · {currency(o.faturamento)}
              </span>
            </div>
          ))}
        </div>
      </Panel>
    </>
  )
}
