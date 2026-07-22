// Agenda do comercial: todas as atividades dos negócios do workspace, agrupadas
// por urgência. Tarefas atrasadas primeiro — é a leitura que o vendedor precisa
// ao abrir a aba.
import { motion } from "framer-motion"
import { CalendarClock, CheckCircle2, ListTodo } from "lucide-react"
import { useMemo } from "react"

import { fadeUpItem, staggerContainer } from "@/shared/lib/motion"
import { EmptyState, Spinner, cx } from "@/shared/ui/primitives"

import { useWorkspaceActivities } from "../sales.hooks"
import { ACTIVITY_LABEL, closeDateState, formatDate, formatDateTime } from "../sales.shared"
import type { DealActivity } from "../sales.types"

interface Bucket {
  key: string
  label: string
  items: DealActivity[]
}

export function ActivitiesView({ workspaceId }: { workspaceId: string | null }) {
  const { data: activities, isLoading } = useWorkspaceActivities(workspaceId)

  const buckets = useMemo<Bucket[]>(() => {
    const list = activities ?? []
    const pending = list.filter((a) => a.kind === "task" && !a.done_at)
    const overdue = pending.filter((a) => closeDateState(a.due_date) === "overdue")
    const today = pending.filter((a) => closeDateState(a.due_date) === "today")
    const upcoming = pending.filter((a) => {
      const state = closeDateState(a.due_date)
      return state === "soon" || state === "far" || state === null
    })
    const others = list.filter((a) => a.kind !== "task" || !!a.done_at)

    return [
      { key: "overdue", label: "Atrasadas", items: overdue },
      { key: "today", label: "Para hoje", items: today },
      { key: "upcoming", label: "Próximas", items: upcoming },
      { key: "others", label: "Notas, reuniões e concluídas", items: others },
    ].filter((b) => b.items.length > 0)
  }, [activities])

  if (isLoading) {
    return (
      <div className="grid place-items-center py-20">
        <Spinner className="size-6" />
      </div>
    )
  }

  if (buckets.length === 0) {
    return (
      <EmptyState
        icon={<ListTodo className="size-6" />}
        title="Nenhuma atividade registrada"
        description="Notas, tarefas e reuniões criadas dentro dos negócios aparecem aqui."
      />
    )
  }

  return (
    <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-6">
      {buckets.map((bucket) => (
        <motion.section key={bucket.key} variants={fadeUpItem}>
          <h3 className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-paper-500">
            {bucket.key === "overdue" ? (
              <CalendarClock className="size-3.5 text-danger" />
            ) : (
              <ListTodo className="size-3.5" />
            )}
            {bucket.label}
            <span className="rounded-full bg-paper-100 px-1.5 text-[10px] tabular text-paper-600 dark:bg-ink-800">
              {bucket.items.length}
            </span>
          </h3>

          <ul className="space-y-1.5">
            {bucket.items.map((a) => (
              <li
                key={a.id}
                className={cx(
                  "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-3 py-2.5",
                  bucket.key === "overdue"
                    ? "border-danger/30 bg-danger/5"
                    : "border-paper-200 bg-paper dark:border-ink-700 dark:bg-ink-900",
                )}
              >
                <span className="rounded bg-paper-100 px-1.5 py-0.5 text-[10px] font-semibold text-paper-600 dark:bg-ink-800 dark:text-paper-400">
                  {ACTIVITY_LABEL[a.kind]}
                </span>
                <span
                  className={cx(
                    "min-w-0 flex-1 truncate text-sm text-ink dark:text-paper",
                    a.done_at && "text-paper-400 line-through",
                  )}
                >
                  {a.content}
                </span>
                {a.deal_title && (
                  <span className="truncate text-[11px] text-paper-500">{a.deal_title}</span>
                )}
                {a.due_date ? (
                  <span className="text-[11px] tabular text-paper-500">
                    {formatDate(a.due_date)}
                  </span>
                ) : (
                  <span className="text-[11px] tabular text-paper-400">
                    {formatDateTime(a.created_at)}
                  </span>
                )}
                {a.done_at && <CheckCircle2 className="size-4 shrink-0 text-success" />}
              </li>
            ))}
          </ul>
        </motion.section>
      ))}
    </motion.div>
  )
}
