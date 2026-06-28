import { ChevronLeft, ChevronRight } from "lucide-react"
import { useMemo, useState } from "react"
import { cx } from "@/shared/ui/primitives"
import type { Card, CardPriority } from "@/features/workspace/workspace.types"

const PRIORITY_COLOR: Record<CardPriority, string> = {
  low: "bg-paper-200 dark:bg-ink-700 text-paper-600",
  medium: "bg-brand-100 text-brand-700",
  high: "bg-orange-100 text-orange-700",
  urgent: "bg-red-100 text-red-700",
}

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]
const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]

export function CalendarioView({
  cards,
  onOpen,
}: {
  cards: Card[]
  onOpen: (c: Card) => void
}) {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())

  function prev() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) } else setMonth(m => m - 1)
  }
  function next() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) } else setMonth(m => m + 1)
  }

  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const startWeekday = new Date(year, month, 1).getDay()

  // Map day → cards with due_date on that day
  const cardsByDay = useMemo(() => {
    const map: Record<number, Card[]> = {}
    cards.forEach((c) => {
      if (!c.due_date) return
      const d = new Date(c.due_date)
      if (d.getFullYear() === year && d.getMonth() === month) {
        const day = d.getDate()
        if (!map[day]) map[day] = []
        map[day].push(c)
      }
    })
    return map
  }, [cards, year, month])

  const today = now.getDate()
  const isCurrentMonth = now.getFullYear() === year && now.getMonth() === month

  // Build calendar grid (6 weeks max)
  const cells: (number | null)[] = [
    ...Array(startWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const cardsWithoutDate = cards.filter((c) => !c.due_date)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={prev} className="grid size-7 place-items-center rounded-lg border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-900 text-paper-500 hover:bg-paper-100 dark:hover:bg-ink-800 transition-colors">
          <ChevronLeft className="size-4" />
        </button>
        <h3 className="text-base font-semibold text-ink dark:text-paper min-w-[200px] text-center">
          {MONTHS[month]} {year}
        </h3>
        <button onClick={next} className="grid size-7 place-items-center rounded-lg border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-900 text-paper-500 hover:bg-paper-100 dark:hover:bg-ink-800 transition-colors">
          <ChevronRight className="size-4" />
        </button>
        <button
          onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()) }}
          className="ml-2 rounded-lg border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-900 px-2.5 py-1 text-xs font-medium text-paper-500 hover:bg-paper-100 dark:hover:bg-ink-800 transition-colors"
        >
          Hoje
        </button>
        <span className="ml-auto text-xs text-paper-400">
          {cards.filter((c) => c.due_date).length} com prazo
        </span>
      </div>

      {/* Calendar grid */}
      <div className="overflow-hidden rounded-2xl border border-paper-200 dark:border-ink-700">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 border-b border-paper-200 dark:border-ink-700 bg-paper-50 dark:bg-ink-900">
          {WEEKDAYS.map((d) => (
            <div key={d} className="py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-paper-500">
              {d}
            </div>
          ))}
        </div>

        {/* Weeks */}
        {Array.from({ length: cells.length / 7 }, (_, wi) => (
          <div key={wi} className="grid grid-cols-7 divide-x divide-paper-100 dark:divide-ink-800 border-b border-paper-100 dark:border-ink-800">
            {cells.slice(wi * 7, wi * 7 + 7).map((day, di) => {
              const isToday = isCurrentMonth && day === today
              const dayCards = day ? (cardsByDay[day] ?? []) : []
              return (
                <div
                  key={di}
                  className={cx(
                    "min-h-[100px] p-2",
                    !day && "bg-paper-50/50",
                    isToday && "bg-brand-50/40",
                  )}
                >
                  {day && (
                    <>
                      <span className={cx(
                        "mb-1.5 flex size-6 items-center justify-center rounded-full text-xs font-medium",
                        isToday ? "bg-brand-500 text-white" : "text-paper-500",
                      )}>
                        {day}
                      </span>
                      <div className="space-y-1">
                        {dayCards.slice(0, 3).map((c) => (
                          <button
                            key={c.id}
                            onClick={() => onOpen(c)}
                            className={cx(
                              "w-full rounded px-1.5 py-0.5 text-left text-[10px] font-medium truncate transition-opacity hover:opacity-80",
                              PRIORITY_COLOR[c.priority],
                            )}
                            title={c.title}
                          >
                            {c.ref} {c.title}
                          </button>
                        ))}
                        {dayCards.length > 3 && (
                          <span className="text-[10px] text-paper-400">+{dayCards.length - 3} mais</span>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* Cards without due date */}
      {cardsWithoutDate.length > 0 && (
        <div className="rounded-2xl border border-dashed border-paper-200 dark:border-ink-700 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-paper-400">
            Sem prazo ({cardsWithoutDate.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {cardsWithoutDate.slice(0, 20).map((c) => (
              <button
                key={c.id}
                onClick={() => onOpen(c)}
                className="rounded-lg border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-900 px-2.5 py-1 text-xs text-ink dark:text-paper hover:bg-paper-100 dark:hover:bg-ink-800 transition-colors"
              >
                {c.ref} · {c.title}
              </button>
            ))}
            {cardsWithoutDate.length > 20 && (
              <span className="text-xs text-paper-400 self-center">+{cardsWithoutDate.length - 20} mais</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
