// Command Deck do Marketing — página inicial do space.
//
// Mesma superfície escura e as mesmas primitivas do deck comercial
// (`features/sales/deck`): um vocabulário visual só para os dois painéis, em
// vez de dois dialetos. O que muda é a pergunta que a tela responde — lá é
// "quanto vamos fechar", aqui é "o que sai, como performou e o que pode
// quebrar".
//
// Motion: a timeline GSAP de `deck.motion` cuida da abertura (título por
// caractere, KPIs em cascata do centro, barras de canal escalando em X) e os
// painéis abaixo revelam por ScrollTrigger ao entrar no viewport. Com
// prefers-reduced-motion nada anima — tudo nasce no estado final.
//
// Dados: tudo vem de leituras já existentes em `integrations/insights.api`.
// Nenhum número aqui é inventado; onde a API não tem dado, o painel diz que
// está vazio em vez de mostrar zero como se fosse medição.
import {
  CalendarClock,
  CheckCircle2,
  Eye,
  Heart,
  RefreshCw,
  Send,
  ShieldAlert,
} from "lucide-react"
import { useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useReducedMotion } from "framer-motion"

import {
  useAccountsHealth,
  useAnalyticsTimeseries,
  useQueueStats,
  type AccountHealth,
  type ChannelStats,
} from "@/features/integrations/insights.api"
import { DeckCard, KpiCard, Sparkline } from "@/features/sales/deck/DeckCard"
import { MARK, mark } from "@/features/sales/deck/deck.marks"
import {
  introTimeline,
  revealPanels,
  settleDeck,
  useGSAP,
} from "@/features/sales/deck/deck.motion"
import { DECK, TONE, seriesColor } from "@/features/sales/deck/deck.theme"
import { Empty } from "@/features/sales/deck/DeckCharts"
import { useWorkspaceStore } from "@/features/workspace/workspace.store"
import { useWorkspaces } from "@/features/workspace/workspace.hooks"
import { cx } from "@/shared/ui/primitives"

const WINDOWS = [
  { value: "7", label: "7 dias" },
  { value: "30", label: "30 dias" },
  { value: "90", label: "90 dias" },
] as const

type WindowValue = (typeof WINDOWS)[number]["value"]

/** Rótulo legível do canal. Chave desconhecida cai no próprio slug. */
const CHANNEL_LABEL: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  youtube: "YouTube",
  blog: "Blog",
  email: "E-mail",
  site: "Site",
}

const channelLabel = (slug: string) => CHANNEL_LABEL[slug] ?? slug

function compactNumber(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(".", ",")}M`
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1).replace(".", ",")}k`
  return value.toFixed(0)
}

/** Variação percentual entre período atual e anterior. `null` sem base. */
function delta(current: number, previous: number): number | null {
  if (!previous) return null
  return ((current - previous) / previous) * 100
}

export function MarketingDeck() {
  const navigate = useNavigate()
  const reduce = useReducedMotion()
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const { data: workspaces } = useWorkspaces()
  const deckRef = useRef<HTMLDivElement>(null)

  const [days, setDays] = useState<WindowValue>("30")

  const analytics = useAnalyticsTimeseries(workspaceId, Number(days))
  // A fila muda sozinha (o worker publica no horário): revalida a cada minuto
  // enquanto o deck estiver aberto.
  const queue = useQueueStats(workspaceId, 60_000)
  const health = useAccountsHealth(workspaceId, Number(days))

  const workspaceName = workspaces?.find((w) => w.id === workspaceId)?.name ?? "Workspace"
  const totals = analytics.data?.totals
  const previous = analytics.data?.previous

  /** Canais ordenados por impressões — o maior primeiro, cor estável por posição. */
  const channels = useMemo(() => {
    const byChannel = analytics.data?.by_channel ?? {}
    return Object.entries(byChannel)
      .map(([slug, stats]) => ({ slug, ...(stats as ChannelStats) }))
      .sort((a, b) => b.impressions - a.impressions)
  }, [analytics.data])

  const impressionSeries = useMemo(
    () => (analytics.data?.series ?? []).map((p) => p.impressions),
    [analytics.data],
  )
  const engagementSeries = useMemo(
    () => (analytics.data?.series ?? []).map((p) => p.likes + p.comments + p.shares),
    [analytics.data],
  )

  /** Contas que exigem ação: token vencido, expirando ou desconectado. */
  const atRisk = useMemo(
    () => (health.data?.accounts ?? []).filter((a) => a.status !== "healthy"),
    [health.data],
  )

  const loading = analytics.isLoading || queue.isLoading
  const ready = !loading && !!analytics.data

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

  const refreshAll = () => {
    analytics.refetch()
    queue.refetch()
    health.refetch()
  }

  if (!workspaceId) {
    return (
      <DeckShell innerRef={deckRef}>
        <Empty className="py-24">Selecione um workspace para ver o painel de marketing.</Empty>
      </DeckShell>
    )
  }

  const fetching = analytics.isFetching || queue.isFetching || health.isFetching

  return (
    <DeckShell innerRef={deckRef}>
      <header className="mb-4 flex flex-wrap items-center gap-2">
        <button
          onClick={() => navigate("/app/marketing/calendario")}
          className="grid size-8 place-items-center rounded-lg border text-white/60 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300"
          style={{ borderColor: DECK.border }}
          title="Ir para o calendário editorial"
          aria-label="Ir para o calendário editorial"
        >
          <CalendarClock className="size-4" />
        </button>

        <div className="min-w-0">
          <h1
            {...mark(MARK.title)}
            className="truncate text-[15px] font-semibold tracking-[0.14em]"
            style={{ color: DECK.text }}
          >
            MARKETING · COMMAND DECK
          </h1>
          <p className="truncate text-[11px]" style={{ color: DECK.textDim }}>
            {workspaceName} · últimos {days} dias
          </p>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <SegmentedDark
            value={days}
            onChange={(v) => setDays(v as WindowValue)}
            options={WINDOWS.map((w) => ({ value: w.value, label: w.label }))}
          />
          <button
            onClick={refreshAll}
            title="Atualizar dados"
            aria-label="Atualizar dados"
            className="grid size-8 place-items-center rounded-lg border text-white/60 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300"
            style={{ borderColor: DECK.border }}
          >
            <RefreshCw className={cx("size-3.5", fetching && "animate-spin")} />
          </button>
        </div>
      </header>

      {loading || !totals ? (
        <DeckSkeleton />
      ) : (
        <div className="space-y-3">
          {/* ── KPIs ──────────────────────────────────────────────────────── */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              reveal="external"
              index={0}
              label="Alcance"
              value={totals.impressions}
              format={compactNumber}
              icon={Eye}
              hint={`${totals.posts} publicações no período`}
              series={impressionSeries}
              delta={previous ? delta(totals.impressions, previous.impressions) : null}
            />
            <KpiCard
              reveal="external"
              index={1}
              label="Engajamento"
              value={totals.likes + totals.comments + totals.shares}
              format={compactNumber}
              icon={Heart}
              tone="positive"
              hint={`taxa de ${totals.engagement_rate.toFixed(1)}%`}
              series={engagementSeries}
              delta={
                previous
                  ? delta(
                      totals.likes + totals.comments + totals.shares,
                      previous.likes + previous.comments + previous.shares,
                    )
                  : null
              }
            />
            <KpiCard
              reveal="external"
              index={2}
              label="Na fila"
              value={queue.data?.by_status.scheduled ?? 0}
              format={(n) => n.toFixed(0)}
              icon={Send}
              tone={queue.data?.overdue ? "warning" : "accent"}
              hint={
                queue.data?.overdue
                  ? `${queue.data.overdue} atrasada${queue.data.overdue === 1 ? "" : "s"}`
                  : "nenhuma atrasada"
              }
            />
            <KpiCard
              reveal="external"
              index={3}
              label="Entrega (7d)"
              value={queue.data?.last_7d.success_rate ?? 100}
              format={(n) => `${n.toFixed(0)}%`}
              icon={CheckCircle2}
              tone={(queue.data?.last_7d.failed ?? 0) > 0 ? "negative" : "positive"}
              hint={`${queue.data?.last_7d.published ?? 0} publicadas · ${queue.data?.last_7d.failed ?? 0} falhas`}
            />
          </div>

          {/* ── Canais + próximas publicações ─────────────────────────────── */}
          <div className="grid gap-3 lg:grid-cols-[1.6fr_1fr]">
            <DeckCard
              reveal="external"
              {...mark(MARK.panel)}
              index={4}
              title="Desempenho por canal"
              subtitle="Largura = alcance no período · taxa de engajamento à direita"
            >
              <ChannelBars channels={channels} />
            </DeckCard>

            <DeckCard
              reveal="external"
              {...mark(MARK.panel)}
              index={5}
              title="Próximas publicações"
              subtitle="Agendadas para os próximos 14 dias"
            >
              <UpcomingList
                upcoming={queue.data?.upcoming ?? {}}
                next={queue.data?.next_post ?? null}
              />
            </DeckCard>
          </div>

          {/* ── Top posts ─────────────────────────────────────────────────── */}
          <DeckCard
            reveal="external"
            {...mark(MARK.panel)}
            index={6}
            title="Conteúdo que mais performou"
            subtitle="Ordenado por taxa de engajamento no período"
            bodyClassName="px-0 pb-0"
          >
            <TopPosts posts={analytics.data?.top_posts ?? []} />
          </DeckCard>

          {/* ── Saúde das contas ──────────────────────────────────────────── */}
          <DeckCard
            reveal="external"
            {...mark(MARK.panel)}
            index={7}
            title="Saúde das contas"
            subtitle={
              atRisk.length
                ? `${atRisk.length} conta${atRisk.length === 1 ? "" : "s"} precisa${atRisk.length === 1 ? "" : "m"} de atenção`
                : "Todas as contas conectadas e com token válido"
            }
            bodyClassName="px-0 pb-0"
            action={
              <button
                type="button"
                onClick={() => navigate("/app/marketing/redes")}
                className="shrink-0 rounded-md px-2 py-1 text-[11px] text-white/60 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300"
              >
                Gerenciar
              </button>
            }
          >
            <AccountsHealthList accounts={health.data?.accounts ?? []} />
          </DeckCard>
        </div>
      )}
    </DeckShell>
  )
}

// ─── Painéis ─────────────────────────────────────────────────────────────────

function ChannelBars({ channels }: { channels: (ChannelStats & { slug: string })[] }) {
  if (!channels.length) {
    return <Empty className="py-10">Nenhuma publicação com métricas no período.</Empty>
  }
  const max = Math.max(1, ...channels.map((c) => c.impressions))

  return (
    <ul className="space-y-1.5">
      {channels.map((channel, i) => {
        const color = seriesColor(i)
        // Piso de 6%: um canal com pouco alcance ainda precisa ser legível.
        const share = Math.max(0.06, channel.impressions / max)
        return (
          <li key={channel.slug} className="flex items-center gap-3">
            <span className="w-24 shrink-0 truncate text-[12px]" style={{ color: DECK.text }}>
              {channelLabel(channel.slug)}
            </span>
            <span className="relative h-7 flex-1 overflow-hidden rounded-md bg-white/[0.03]">
              <span
                {...mark(MARK.bar)}
                className="absolute inset-y-0 left-0 w-full rounded-md"
                style={{
                  transform: `scaleX(${share})`,
                  transformOrigin: "left center",
                  background: `linear-gradient(90deg, ${color}, ${color}66)`,
                }}
              />
              <span
                className="absolute inset-y-0 left-2.5 flex items-center gap-2 text-[11px] font-medium tabular"
                style={{ color: DECK.bg }}
              >
                {compactNumber(channel.impressions)}
                <span className="opacity-70">
                  {channel.posts} post{channel.posts === 1 ? "" : "s"}
                </span>
              </span>
            </span>
            <span
              className="w-14 shrink-0 text-right text-[11px] tabular"
              style={{ color: DECK.textDim }}
            >
              {channel.engagement_rate.toFixed(1)}%
            </span>
          </li>
        )
      })}
    </ul>
  )
}

function UpcomingList({
  upcoming,
  next,
}: {
  upcoming: Record<string, number>
  next: { id: string; channel: string; content: string; scheduled_at: string } | null
}) {
  const days = Object.entries(upcoming)
    .filter(([, count]) => count > 0)
    .sort(([a], [b]) => a.localeCompare(b))

  if (!days.length && !next) {
    return <Empty className="py-10">Nada agendado para os próximos 14 dias.</Empty>
  }

  const max = Math.max(1, ...days.map(([, c]) => c))

  return (
    <div className="space-y-3">
      {next && (
        <div className="rounded-lg border p-2.5" style={{ borderColor: DECK.border }}>
          <p
            className="text-[10px] font-medium uppercase tracking-[0.12em]"
            style={{ color: DECK.textFaint }}
          >
            Próxima · {channelLabel(next.channel)}
          </p>
          <p className="mt-1 line-clamp-2 text-[12px]" style={{ color: DECK.text }}>
            {next.content}
          </p>
          <p className="mt-1 text-[11px] tabular" style={{ color: TONE.accent }}>
            {new Date(next.scheduled_at).toLocaleString("pt-BR", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
      )}

      {/* Cadência: uma coluna por dia. Altura via scaleY para não mexer layout. */}
      <ul className="flex items-end gap-1" style={{ height: 64 }}>
        {days.map(([date, count]) => (
          <li key={date} className="flex flex-1 flex-col items-center gap-1">
            <span
              title={`${count} publicação${count === 1 ? "" : "ões"} em ${new Date(`${date}T00:00`).toLocaleDateString("pt-BR")}`}
              className="w-full rounded-sm"
              style={{
                height: 44,
                transform: `scaleY(${Math.max(0.08, count / max)})`,
                transformOrigin: "bottom",
                background: TONE.accent,
                opacity: 0.75,
              }}
            />
            <span className="text-[9px] tabular" style={{ color: DECK.textFaint }}>
              {new Date(`${date}T00:00`).getDate()}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function TopPosts({
  posts,
}: {
  posts: {
    id: string
    channel: string
    account_name: string
    content: string
    published_at: string
    engagement_rate: number
    metrics: { impressions: number }
  }[]
}) {
  if (!posts.length) {
    return <Empty className="py-10">Sem publicações com métricas ainda.</Empty>
  }

  return (
    <ul className="divide-y" style={{ borderColor: DECK.border }}>
      {posts.slice(0, 6).map((post, i) => (
        <li
          key={post.id}
          className="flex items-center gap-3 px-4 py-2"
          style={{ borderColor: DECK.border }}
        >
          <span
            className="grid size-6 shrink-0 place-items-center rounded-md text-[11px] font-semibold tabular"
            style={{ background: `${seriesColor(i)}1F`, color: seriesColor(i) }}
          >
            {i + 1}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px]" style={{ color: DECK.text }}>
              {post.content}
            </span>
            <span className="block truncate text-[11px]" style={{ color: DECK.textDim }}>
              {channelLabel(post.channel)} · {post.account_name} ·{" "}
              {new Date(post.published_at).toLocaleDateString("pt-BR")}
            </span>
          </span>
          <span className="shrink-0 text-right text-[11px] tabular" style={{ color: DECK.textDim }}>
            {compactNumber(post.metrics.impressions)}
          </span>
          <span
            className="w-14 shrink-0 text-right text-[12px] font-semibold tabular"
            style={{ color: TONE.positive }}
          >
            {post.engagement_rate.toFixed(1)}%
          </span>
        </li>
      ))}
    </ul>
  )
}

const HEALTH_TONE: Record<AccountHealth["status"], keyof typeof TONE> = {
  healthy: "positive",
  expiring: "warning",
  expired: "negative",
  disconnected: "negative",
}

const HEALTH_LABEL: Record<AccountHealth["status"], string> = {
  healthy: "OK",
  expiring: "expira em breve",
  expired: "token expirado",
  disconnected: "desconectada",
}

function AccountsHealthList({ accounts }: { accounts: AccountHealth[] }) {
  if (!accounts.length) {
    return <Empty className="py-10">Nenhuma conta de rede social conectada.</Empty>
  }

  // Quem precisa de ação primeiro: a lista existe para expor problema.
  const ordered = [...accounts].sort((a, b) =>
    a.status === b.status ? 0 : a.status === "healthy" ? 1 : -1,
  )

  return (
    <ul className="divide-y" style={{ borderColor: DECK.border }}>
      {ordered.map((account) => {
        const tone = TONE[HEALTH_TONE[account.status]]
        const ok = account.status === "healthy"
        return (
          <li
            key={account.id}
            className="flex items-center gap-3 px-4 py-2"
            style={{ borderColor: DECK.border }}
          >
            {ok ? (
              <CheckCircle2 className="size-3.5 shrink-0" style={{ color: tone }} />
            ) : (
              <ShieldAlert className="size-3.5 shrink-0" style={{ color: tone }} />
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px]" style={{ color: DECK.text }}>
                {account.account_name}
              </span>
              <span className="block truncate text-[11px]" style={{ color: DECK.textDim }}>
                {channelLabel(account.channel)} · {account.posts.published} publicadas
                {account.posts.failed > 0 ? ` · ${account.posts.failed} falhas` : ""}
              </span>
            </span>
            {account.sparkline.length > 1 && (
              <span className="hidden h-7 w-20 shrink-0 sm:block" aria-hidden>
                <Sparkline data={account.sparkline} color={tone} />
              </span>
            )}
            <span
              className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium"
              style={{ background: `${tone}1F`, color: tone }}
            >
              {HEALTH_LABEL[account.status]}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

// ─── Casca e controles ───────────────────────────────────────────────────────

function DeckShell({
  children,
  innerRef,
}: {
  children: React.ReactNode
  innerRef: React.RefObject<HTMLDivElement>
}) {
  return (
    <div
      className="-mx-4 -my-5 min-h-full px-4 py-5 sm:-mx-6 sm:-my-7 sm:px-6 sm:py-7"
      style={{ background: DECK.bg }}
    >
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

function SegmentedDark({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div
      role="group"
      aria-label="Janela de tempo"
      className="flex items-center gap-0.5 rounded-lg border p-0.5"
      style={{ borderColor: DECK.border, background: DECK.surface }}
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            className={cx(
              "rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300",
              active ? "text-white" : "text-white/50 hover:text-white/80",
            )}
            style={active ? { background: DECK.surfaceHi } : undefined}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

function DeckSkeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="h-[104px] animate-pulse rounded-xl border"
            style={{ background: DECK.surface, borderColor: DECK.border }}
          />
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-[1.6fr_1fr]">
        {Array.from({ length: 2 }, (_, i) => (
          <div
            key={i}
            className="h-56 animate-pulse rounded-xl border"
            style={{ background: DECK.surface, borderColor: DECK.border }}
          />
        ))}
      </div>
      <div
        className="h-64 animate-pulse rounded-xl border"
        style={{ background: DECK.surface, borderColor: DECK.border }}
      />
    </div>
  )
}
