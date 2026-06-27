import { LineChart, Loader2 } from "lucide-react"

import {
  useWorkspaceCards,
  useWorkspaces,
  type BoardCard,
} from "@/features/workspace/workspace.hooks"
import type { CardPriority, CardStatus, CardType } from "@/features/workspace/workspace.types"
import { PageHeader, cx } from "@/shared/ui/primitives"

const STATUS_LABEL: Record<CardStatus, string> = {
  backlog: "Backlog",
  todo: "A fazer",
  doing: "Em andamento",
  review: "Em revisão",
  done: "Concluído",
}
const TYPE_LABEL: Record<CardType, string> = {
  feature: "Feature",
  bug: "Bug",
  debt: "Débito",
  spike: "Spike",
  chore: "Tarefa",
}
const PRIORITY_LABEL: Record<CardPriority, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  urgent: "Urgente",
}

function tally<K extends string>(cards: BoardCard[], key: (c: BoardCard) => K): Record<K, number> {
  const out = {} as Record<K, number>
  for (const c of cards) {
    const k = key(c)
    out[k] = (out[k] ?? 0) + 1
  }
  return out
}

export function ReportsPage() {
  const { activeWorkspaceId } = useWorkspaces()
  const { cards, isLoading } = useWorkspaceCards(activeWorkspaceId)

  const total = cards.length
  const done = cards.filter((c) => c.status === "done").length
  const wip = cards.filter((c) => c.status === "doing" || c.status === "review").length
  const pointsTotal = cards.reduce((s, c) => s + (c.points ?? 0), 0)
  const pointsDone = cards.filter((c) => c.status === "done").reduce((s, c) => s + (c.points ?? 0), 0)
  const completion = total > 0 ? Math.round((done / total) * 100) : 0

  const byStatus = tally(cards, (c) => c.status)
  const byType = tally(cards, (c) => c.type)
  const byPriority = tally(cards, (c) => c.priority)

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <>
            <LineChart className="size-4 text-brand-500" />
            <span>Relatórios</span>
          </>
        }
        title="Métricas de fluxo"
        subtitle="Indicadores calculados a partir dos cards reais do workspace."
      />

      {isLoading ? (
        <div className="grid place-items-center py-20">
          <Loader2 className="size-6 animate-spin text-paper-400" />
        </div>
      ) : total === 0 ? (
        <div className="surface p-10 text-center">
          <p className="text-sm font-medium text-ink">Ainda não há cards para medir.</p>
          <p className="mt-1 text-sm text-paper-500">
            Crie projetos e cards nos boards — as métricas aparecem aqui automaticamente.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Total de cards" value={total} />
            <Stat label="Concluídos" value={done} hint={`${completion}% do total`} />
            <Stat label="Em progresso (WIP)" value={wip} />
            <Stat label="Pontos" value={`${pointsDone}/${pointsTotal}`} hint="concluídos / total" />
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <Distribution
              title="Por status"
              entries={(Object.keys(STATUS_LABEL) as CardStatus[])
                .filter((s) => byStatus[s])
                .map((s) => ({ label: STATUS_LABEL[s], value: byStatus[s] ?? 0 }))}
              total={total}
            />
            <Distribution
              title="Por tipo"
              entries={(Object.keys(TYPE_LABEL) as CardType[])
                .filter((t) => byType[t])
                .map((t) => ({ label: TYPE_LABEL[t], value: byType[t] ?? 0 }))}
              total={total}
            />
            <Distribution
              title="Por prioridade"
              entries={(Object.keys(PRIORITY_LABEL) as CardPriority[])
                .filter((p) => byPriority[p])
                .map((p) => ({ label: PRIORITY_LABEL[p], value: byPriority[p] ?? 0 }))}
              total={total}
            />
          </div>

          <p className="text-center text-xs text-paper-500">
            Métricas de velocity histórica e previsão de entrega chegam com o contexto de
            relatórios (fase de Inteligência).
          </p>
        </>
      )}
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="surface p-4">
      <p className="text-[26px] font-bold leading-none text-ink tabular">{value}</p>
      <p className="mt-2 text-[13px] font-medium text-ink">{label}</p>
      {hint && <p className="text-xs text-paper-500">{hint}</p>}
    </div>
  )
}

function Distribution({
  title,
  entries,
  total,
}: {
  title: string
  entries: { label: string; value: number }[]
  total: number
}) {
  return (
    <div className="surface p-5">
      <h3 className="mb-4 text-sm font-semibold text-ink">{title}</h3>
      <div className="space-y-3">
        {entries.map((e) => {
          const pct = total > 0 ? Math.round((e.value / total) * 100) : 0
          return (
            <div key={e.label}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-paper-600">{e.label}</span>
                <span className="font-medium text-ink tabular">
                  {e.value} · {pct}%
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-paper-100">
                <div
                  className={cx("h-full rounded-full bg-brand-500")}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
