import { Clock, Lock, Pause, Play } from "lucide-react"

import { useSetCardPaused } from "@/features/workspace/workspace.hooks"
import type { Card } from "@/features/workspace/workspace.types"
import { formatWorkedTime } from "@/shared/lib/businessTime"
import { cx } from "@/shared/ui/primitives"
import { toast } from "@/shared/ui/toast"

type WorkingCard = Pick<
  Card,
  "id" | "project_id" | "doing_since" | "paused_at" | "worked_seconds" | "blocked_in_progress"
>

/**
 * Tempo real trabalhado no card (horário comercial) + pausar/retomar no clique.
 * Só aparece com o card numa coluna em andamento — rodando (`doing_since`) ou
 * pausado (`paused_at`). Pausar não tira o card da coluna: quem pega outra
 * tarefa no meio para o contador desta sem "devolver" ela pro A fazer.
 */
export function WorkingTimeBadge({
  card,
  readOnly = false,
  className,
}: {
  card: WorkingCard
  /** Clone do arrasto: mostra o tempo, mas não é clicável. */
  readOnly?: boolean
  className?: string
}) {
  const setPaused = useSetCardPaused(card.project_id)
  const paused = !!card.paused_at
  // Bloqueado também para o contador, mas quem resolve é desbloquear — o
  // botão de retomar não faria nada, então o badge fica só informativo.
  const blocked = !!card.blocked_in_progress
  if (!card.doing_since && !paused && !blocked) return null

  const time = formatWorkedTime(card)
  const tone = blocked
    ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
    : paused
      ? "bg-paper-100 text-paper-500 dark:bg-ink-700 dark:text-paper-400"
      : "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300"
  const content = (
    <>
      {blocked ? (
        <Lock className="size-3" />
      ) : paused ? (
        <Pause className="size-3" />
      ) : (
        <Clock className="size-3" />
      )}
      {blocked ? <span>Bloqueado ·</span> : paused && <span>Pausado ·</span>}
      <span className="tabular">{time}</span>
    </>
  )
  const base = cx("inline-flex items-center gap-1 rounded px-1.5 py-0.5", tone, className)

  if (readOnly || blocked) {
    return (
      <span className={base} title={blocked ? "Bloqueado: o tempo não conta até desbloquear" : undefined}>
        {content}
      </span>
    )
  }

  const label = paused ? "Retomar contagem de tempo" : "Pausar contagem de tempo"
  return (
    <button
      type="button"
      aria-label={label}
      title={`${label} (horário comercial)`}
      disabled={setPaused.isPending}
      // Card do Kanban é arrastável e abre o drawer no clique: o gesto não
      // pode subir pra ele.
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation()
        setPaused.mutate(
          { cardId: card.id, paused: !paused },
          { onError: () => toast.error("Não foi possível pausar/retomar o card") },
        )
      }}
      className={cx(base, "group/pause cursor-pointer hover:ring-1 hover:ring-current disabled:opacity-60")}
    >
      {content}
      {paused ? (
        <Play className="size-3 opacity-0 group-hover/pause:opacity-100" />
      ) : (
        <Pause className="size-3 opacity-0 group-hover/pause:opacity-100" />
      )}
    </button>
  )
}
