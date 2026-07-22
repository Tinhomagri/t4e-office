// Calendário editorial — grade mensal dos posts sociais agendados/publicados
// (contexto integrations). Reagendar, publicar agora e excluir por post.
import { CheckCircle2, ChevronLeft, ChevronRight, Send, Trash2 } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import {
  deletePost,
  listPosts,
  publishPost,
  updatePost,
  type ScheduledPost,
} from "@/features/integrations/social.api"
import { cx } from "@/shared/ui/primitives"
import { toast } from "@/shared/ui/toast"
import { CHANNEL_COLOR, CHANNEL_LABEL } from "./CalendarioView"

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]
const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]

export function EditorialCalendar({
  workspaceId,
  projectId,
}: {
  workspaceId: string
  projectId?: string
}) {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth()) // 0-based
  const [posts, setPosts] = useState<ScheduledPost[]>([])
  const [selected, setSelected] = useState<ScheduledPost | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    const key = `${year}-${String(month + 1).padStart(2, "0")}`
    void listPosts(workspaceId, { projectId, month: key })
      .then(setPosts)
      .catch(() => toast.error("Falha ao carregar posts do mês."))
  }, [workspaceId, projectId, year, month])

  useEffect(() => {
    load()
    setSelected(null)
  }, [load])

  const shift = (delta: number) => {
    const d = new Date(year, month + delta, 1)
    setYear(d.getFullYear())
    setMonth(d.getMonth())
  }

  const doAction = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true)
    try {
      await fn()
      toast.success(ok)
      setSelected(null)
      load()
    } catch {
      toast.error("Ação falhou.")
    } finally {
      setBusy(false)
    }
  }

  const firstWeekday = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  const byDay = new Map<number, ScheduledPost[]>()
  for (const p of posts) {
    const day = new Date(p.scheduled_at).getDate()
    byDay.set(day, [...(byDay.get(day) ?? []), p])
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button onClick={() => shift(-1)} className="rounded-lg p-1.5 hover:bg-paper-100 dark:hover:bg-ink-800" aria-label="Mês anterior">
          <ChevronLeft className="size-4" />
        </button>
        <p className="text-sm font-semibold text-ink dark:text-paper">
          {MONTHS[month]} {year}
        </p>
        <button onClick={() => shift(1)} className="rounded-lg p-1.5 hover:bg-paper-100 dark:hover:bg-ink-800" aria-label="Próximo mês">
          <ChevronRight className="size-4" />
        </button>
        <span className="ml-auto text-xs text-paper-400">
          {posts.length} post(s) no mês · clique num post para gerenciar
        </span>
      </div>

      <div className="overflow-hidden rounded-2xl border border-paper-200 dark:border-ink-700">
        <div className="grid grid-cols-7 border-b border-paper-200 dark:border-ink-700 bg-paper-50 dark:bg-ink-900">
          {WEEKDAYS.map((d) => (
            <div key={d} className="px-2 py-1.5 text-center text-[11px] font-bold uppercase tracking-widest text-paper-500">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((day, i) => {
            const isToday =
              day === today.getDate() && month === today.getMonth() && year === today.getFullYear()
            return (
              <div
                key={i}
                className={cx(
                  "min-h-20 border-b border-r border-paper-100 dark:border-ink-800 p-1",
                  day === null && "bg-paper-50/60 dark:bg-ink-950/40",
                )}
              >
                {day !== null && (
                  <>
                    <p className={cx("mb-1 text-right text-[11px]", isToday ? "font-bold text-brand-600" : "text-paper-400")}>
                      {day}
                    </p>
                    <div className="space-y-0.5">
                      {(byDay.get(day) ?? []).map((p) => (
                        <button
                          key={p.id}
                          onClick={() => setSelected(selected?.id === p.id ? null : p)}
                          title={p.content}
                          className={cx(
                            "block w-full truncate rounded px-1.5 py-0.5 text-left text-[10px] font-medium",
                            CHANNEL_COLOR[p.channel] ?? "bg-paper-200 text-paper-600",
                            p.status === "published" && "opacity-60 line-through",
                            selected?.id === p.id && "ring-2 ring-brand-500",
                          )}
                        >
                          {CHANNEL_LABEL[p.channel] ?? p.channel}: {p.content}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {selected && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-paper-200 dark:border-ink-700 bg-white dark:bg-ink-900 p-3">
          <span className={cx("rounded-full px-2 py-0.5 text-[10px] font-medium", CHANNEL_COLOR[selected.channel] ?? "bg-paper-200 text-paper-600")}>
            {CHANNEL_LABEL[selected.channel] ?? selected.channel} · {selected.account_name}
          </span>
          <p className="min-w-0 flex-1 truncate text-sm text-ink dark:text-paper" title={selected.content}>
            {selected.content}
          </p>
          {selected.status === "published" ? (
            <span className="flex items-center gap-1 text-xs text-success">
              <CheckCircle2 className="size-4" /> Publicado
            </span>
          ) : (
            <>
              <input
                type="date"
                defaultValue={selected.scheduled_at.slice(0, 10)}
                disabled={busy}
                onChange={(e) => {
                  if (!e.target.value) return
                  const time = selected.scheduled_at.slice(11, 16) || "09:00"
                  void doAction(
                    () => updatePost(selected.id, {
                      scheduled_at: new Date(`${e.target.value}T${time}`).toISOString(),
                    }),
                    "Post reagendado.",
                  )
                }}
                className="rounded-lg border border-paper-200 dark:border-ink-700 bg-white dark:bg-ink-800 px-2 py-1 text-xs text-ink dark:text-paper"
                aria-label="Reagendar post"
              />
              <button
                onClick={() => doAction(() => publishPost(selected.id), "Post publicado!")}
                disabled={busy}
                className="flex items-center gap-1 rounded-lg bg-brand-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
              >
                <Send className="size-3.5" /> Publicar agora
              </button>
              <button
                onClick={() => doAction(() => deletePost(selected.id), "Post excluído.")}
                disabled={busy}
                className="rounded-lg p-1.5 text-danger hover:bg-danger/10"
                aria-label="Excluir post"
              >
                <Trash2 className="size-4" />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
