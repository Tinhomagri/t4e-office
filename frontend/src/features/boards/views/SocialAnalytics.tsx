// Analytics consolidado dos posts publicados nas redes (contexto integrations).
// Métricas simuladas/plugáveis no backend — mesma API quando o provider for real.
import { RefreshCw } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import {
  getAnalytics,
  type SocialAnalytics as Analytics,
} from "@/features/integrations/social.api"
import { cx } from "@/shared/ui/primitives"
import { toast } from "@/shared/ui/toast"
import { CHANNEL_COLOR, CHANNEL_LABEL } from "./CalendarioView"

const fmt = (n: number) => n.toLocaleString("pt-BR")

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-paper-200 dark:border-ink-700 bg-white dark:bg-ink-900 p-4">
      <p className="text-[11px] font-bold uppercase tracking-widest text-paper-500 dark:text-paper-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-ink dark:text-paper">{value}</p>
    </div>
  )
}

export function SocialAnalytics({
  workspaceId,
  projectId,
}: {
  workspaceId: string
  projectId?: string
}) {
  const [data, setData] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    void getAnalytics(workspaceId, projectId)
      .then(setData)
      .catch(() => toast.error("Falha ao carregar analytics."))
      .finally(() => setLoading(false))
  }, [workspaceId, projectId])

  useEffect(() => {
    load()
  }, [load])

  if (!data) {
    return <p className="p-6 text-sm text-paper-400">Carregando analytics…</p>
  }

  const channels = Object.entries(data.by_channel).sort(
    (a, b) => b[1].impressions - a[1].impressions,
  )
  const engagement =
    data.totals.impressions > 0
      ? (((data.totals.likes + data.totals.comments + data.totals.shares) / data.totals.impressions) * 100).toFixed(1)
      : null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-paper-400">
          {data.totals.posts} post(s) publicados · coleta atualizada a cada consulta
        </p>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-paper-500 hover:bg-paper-100 dark:hover:bg-ink-800"
        >
          <RefreshCw className={cx("size-3.5", loading && "animate-spin")} /> Atualizar
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Tile label="Impressões" value={fmt(data.totals.impressions)} />
        <Tile label="Curtidas" value={fmt(data.totals.likes)} />
        <Tile label="Comentários" value={fmt(data.totals.comments)} />
        <Tile label="Cliques" value={fmt(data.totals.clicks)} />
        <Tile label="Engajamento" value={engagement === null ? "—" : `${engagement}%`} />
      </div>

      {channels.length === 0 ? (
        <p className="rounded-xl border border-dashed border-paper-200 dark:border-ink-700 p-6 text-center text-sm text-paper-400">
          Nenhum post publicado ainda. Publique pela fila ou pelo calendário editorial.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-paper-200 dark:border-ink-700 bg-white dark:bg-ink-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-paper-200 dark:border-ink-700 text-left text-[11px] font-bold uppercase tracking-widest text-paper-500">
                <th className="px-4 py-2.5">Canal</th>
                <th className="px-4 py-2.5 text-right">Posts</th>
                <th className="px-4 py-2.5 text-right">Impressões</th>
                <th className="px-4 py-2.5 text-right">Curtidas</th>
                <th className="px-4 py-2.5 text-right">Comentários</th>
                <th className="px-4 py-2.5 text-right">Compart.</th>
                <th className="px-4 py-2.5 text-right">Cliques</th>
              </tr>
            </thead>
            <tbody>
              {channels.map(([ch, m]) => (
                <tr key={ch} className="border-b border-paper-100 dark:border-ink-800 last:border-0">
                  <td className="px-4 py-2.5">
                    <span className={cx("rounded-full px-2 py-0.5 text-[10px] font-medium", CHANNEL_COLOR[ch] ?? "bg-paper-200 text-paper-600")}>
                      {CHANNEL_LABEL[ch] ?? ch}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-ink dark:text-paper">{m.posts}</td>
                  <td className="px-4 py-2.5 text-right text-ink dark:text-paper">{fmt(m.impressions)}</td>
                  <td className="px-4 py-2.5 text-right text-ink dark:text-paper">{fmt(m.likes)}</td>
                  <td className="px-4 py-2.5 text-right text-ink dark:text-paper">{fmt(m.comments)}</td>
                  <td className="px-4 py-2.5 text-right text-ink dark:text-paper">{fmt(m.shares)}</td>
                  <td className="px-4 py-2.5 text-right text-ink dark:text-paper">{fmt(m.clicks)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
