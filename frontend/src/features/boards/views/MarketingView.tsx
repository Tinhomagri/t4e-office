// Aba Marketing — hub do projeto de marketing em três blocos:
// 1) Dashboard de campanha (tiles + distribuição por canal)
// 2) Fila de publicação (atrasadas / hoje / próximos 7 dias, com "marcar publicado")
// 3) Biblioteca de peças aprovadas (última versão aprovada de cada grupo)
import { CalendarClock, CheckCircle2, FileImage, FileText, Megaphone, TriangleAlert } from "lucide-react"
import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { cx } from "@/shared/ui/primitives"
import {
  useMarketingAssets,
  useMarketingReport,
  useUpdateCard,
} from "@/features/workspace/workspace.hooks"
import type { Card, CardStatus, MarketingQueueCard } from "@/features/workspace/workspace.types"
import { CHANNEL_COLOR, CHANNEL_LABEL } from "./CalendarioView"

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  const [y, m, d] = iso.split("-")
  return `${d}/${m}/${y}`
}

function ChannelBadge({ channel }: { channel: string }) {
  if (!channel) return null
  return (
    <span className={cx("rounded-full px-2 py-0.5 text-[10px] font-medium", CHANNEL_COLOR[channel] ?? "bg-paper-200 text-paper-600")}>
      {CHANNEL_LABEL[channel] ?? channel}
    </span>
  )
}

function StatTile({ label, value, hint, tone = "default" }: {
  label: string
  value: string | number
  hint?: string
  tone?: "default" | "danger" | "success"
}) {
  return (
    <div className="rounded-xl border border-paper-200 dark:border-ink-700 bg-white dark:bg-ink-900 p-4">
      <p className="text-[11px] font-bold uppercase tracking-widest text-paper-500 dark:text-paper-400">{label}</p>
      <p className={cx(
        "mt-1 text-2xl font-bold",
        tone === "danger" ? "text-danger" : tone === "success" ? "text-success" : "text-ink dark:text-paper",
      )}>
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-paper-400">{hint}</p>}
    </div>
  )
}

export function MarketingView({
  projectId,
  cards,
  onOpen,
}: {
  projectId: string
  cards: Card[]
  onOpen: (c: Card) => void
}) {
  const qc = useQueryClient()
  const { data: report, isLoading } = useMarketingReport(projectId)
  const [channelFilter, setChannelFilter] = useState("")
  const { data: assets } = useMarketingAssets(projectId, channelFilter || undefined)
  const updateCard = useUpdateCard(projectId)

  if (isLoading || !report) {
    return <p className="p-6 text-sm text-paper-400">Carregando painel de marketing…</p>
  }

  // Status "publicado" do workflow (fallback: primeiro status de categoria done)
  // Slugs de workflow são dinâmicos por projeto; o backend valida o destino.
  const publishedStatus = (report.done_statuses.includes("publicado")
    ? "publicado"
    : report.done_statuses[0] ?? "done") as CardStatus

  const openById = (id: string) => {
    const card = cards.find((c) => c.id === id)
    if (card) onOpen(card)
  }

  const markPublished = (item: MarketingQueueCard) => {
    updateCard.mutate(
      { cardId: item.id, input: { status: publishedStatus } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: ["marketing-report", projectId] })
          qc.invalidateQueries({ queryKey: ["marketing-assets", projectId] })
        },
      },
    )
  }

  const channelEntries = Object.entries(report.by_channel).sort((a, b) => b[1] - a[1])
  const channelMax = Math.max(1, ...channelEntries.map(([, n]) => n))

  const queueSections: { key: string; title: string; icon: React.ReactNode; items: MarketingQueueCard[]; danger?: boolean }[] = [
    { key: "overdue", title: "Atrasadas", icon: <TriangleAlert className="size-4 text-danger" />, items: report.queue.overdue, danger: true },
    { key: "today", title: "Publicar hoje", icon: <Megaphone className="size-4 text-brand-600" />, items: report.queue.today },
    { key: "week", title: "Próximos 7 dias", icon: <CalendarClock className="size-4 text-paper-500" />, items: report.queue.week },
  ]

  return (
    <div className="space-y-6 pb-8">
      {/* ── Dashboard de campanha ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile label="Peças" value={report.totals.cards} />
        <StatTile label="Planejadas" value={report.totals.planned} hint="com data de publicação" />
        <StatTile label="Publicadas" value={report.totals.published} tone="success" />
        <StatTile
          label="Atrasadas"
          value={report.totals.overdue}
          tone={report.totals.overdue > 0 ? "danger" : "default"}
        />
        <StatTile
          label="Taxa de aprovação"
          value={report.approval.rate === null ? "—" : `${report.approval.rate}%`}
          hint={`${report.approval.approved} aprovadas · ${report.approval.rejected} reprovadas`}
        />
      </div>

      {channelEntries.length > 0 && (
        <div className="rounded-xl border border-paper-200 dark:border-ink-700 bg-white dark:bg-ink-900 p-4">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-paper-500 dark:text-paper-400">
            Peças por canal
          </p>
          <div className="space-y-2">
            {channelEntries.map(([ch, n]) => (
              <div key={ch} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-xs text-ink dark:text-paper">{CHANNEL_LABEL[ch] ?? ch}</span>
                <div className="h-2.5 flex-1 rounded-full bg-paper-100 dark:bg-ink-800">
                  <div
                    className="h-2.5 rounded-full bg-brand-500 transition-all"
                    style={{ width: `${(n / channelMax) * 100}%` }}
                  />
                </div>
                <span className="w-8 text-right text-xs font-semibold text-ink dark:text-paper">{n}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Fila de publicação ── */}
      <div className="grid gap-3 lg:grid-cols-3">
        {queueSections.map((sec) => (
          <div
            key={sec.key}
            className={cx(
              "rounded-xl border bg-white dark:bg-ink-900 p-4",
              sec.danger && sec.items.length > 0
                ? "border-danger/40"
                : "border-paper-200 dark:border-ink-700",
            )}
          >
            <div className="mb-2 flex items-center gap-2">
              {sec.icon}
              <p className="text-sm font-semibold text-ink dark:text-paper">{sec.title}</p>
              <span className="ml-auto text-xs text-paper-400">{sec.items.length}</span>
            </div>
            {sec.items.length === 0 ? (
              <p className="text-xs text-paper-400">Nada por aqui 🎉</p>
            ) : (
              <ul className="space-y-1.5">
                {sec.items.map((item) => (
                  <li
                    key={item.id}
                    className="group flex items-center gap-2 rounded-lg border border-paper-100 dark:border-ink-800 px-2.5 py-1.5"
                  >
                    <button
                      onClick={() => openById(item.id)}
                      className="min-w-0 flex-1 text-left"
                      title={item.title}
                    >
                      <span className="block truncate text-sm text-ink dark:text-paper">
                        <span className="mr-1.5 text-xs font-semibold text-paper-400">{item.ref}</span>
                        {item.title}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5">
                        <ChannelBadge channel={item.channel} />
                        <span className={cx("text-[11px]", sec.danger ? "text-danger font-medium" : "text-paper-400")}>
                          {formatDate(item.publish_date)}
                        </span>
                      </span>
                    </button>
                    <button
                      onClick={() => markPublished(item)}
                      disabled={updateCard.isPending}
                      className="shrink-0 rounded-md px-1.5 py-1 text-success opacity-0 transition-opacity hover:bg-success/10 group-hover:opacity-100"
                      title="Marcar como publicado"
                      aria-label={`Marcar ${item.ref} como publicado`}
                    >
                      <CheckCircle2 className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      {/* ── Biblioteca de peças aprovadas ── */}
      <div className="rounded-xl border border-paper-200 dark:border-ink-700 bg-white dark:bg-ink-900 p-4">
        <div className="mb-3 flex items-center gap-3">
          <p className="text-[11px] font-bold uppercase tracking-widest text-paper-500 dark:text-paper-400">
            Biblioteca de peças aprovadas
          </p>
          <select
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value)}
            className="ml-auto rounded-lg border border-paper-200 dark:border-ink-700 bg-white dark:bg-ink-800 px-2 py-1 text-xs text-ink dark:text-paper outline-none focus:border-brand-400"
            aria-label="Filtrar biblioteca por canal"
          >
            <option value="">Todos os canais</option>
            {Object.entries(CHANNEL_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        {!assets || assets.length === 0 ? (
          <p className="text-xs text-paper-400">
            Nenhuma peça aprovada ainda. Peças entram aqui quando o anexo é aprovado no fluxo de aprovação.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {assets.map((asset) => {
              const isImage = asset.mime_type.startsWith("image/")
              return (
                <button
                  key={asset.id}
                  onClick={() => openById(asset.card.id)}
                  className="group overflow-hidden rounded-xl border border-paper-200 dark:border-ink-700 text-left transition-colors hover:border-brand-400"
                  title={`${asset.card.ref} — ${asset.card.title}`}
                >
                  <div className="flex h-28 items-center justify-center bg-paper-50 dark:bg-ink-950/40">
                    {isImage && asset.url ? (
                      <img src={asset.url} alt={asset.filename} className="h-full w-full object-cover" loading="lazy" />
                    ) : isImage ? (
                      <FileImage className="size-8 text-paper-300" />
                    ) : (
                      <FileText className="size-8 text-paper-300" />
                    )}
                  </div>
                  <div className="space-y-1 p-2.5">
                    <p className="truncate text-xs font-medium text-ink dark:text-paper">{asset.filename}</p>
                    <div className="flex items-center gap-1.5">
                      <ChannelBadge channel={asset.card.channel} />
                      <span className="text-[10px] text-paper-400">v{asset.version}</span>
                    </div>
                    <p className="truncate text-[11px] text-paper-400">{asset.card.ref} · {asset.card.title}</p>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
