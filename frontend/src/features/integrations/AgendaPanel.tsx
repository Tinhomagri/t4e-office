// Painel lateral de agenda — réplica do painel "dia" que o Google Workspace abre
// no canto direito em qualquer página. Fica fora do fluxo de rotas (montado no
// AppShell), então funciona em qualquer tela sem sair do contexto atual.
import { AnimatePresence, motion } from "framer-motion"
import { ChevronDown, ChevronLeft, ChevronRight, ExternalLink, Video, X } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"

import { Spinner, cx } from "@/shared/ui/primitives"
import { useDayEvents, useGoogleStatus } from "./integrations.hooks"
import type { CalendarEvent } from "./integrations.types"

const DAY_START_HOUR = 0
const DAY_END_HOUR = 24
const HOUR_PX = 48
// Ao abrir, rola a grade até um pouco antes do primeiro compromisso do dia.
const DEFAULT_SCROLL_HOUR = 7

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function hourLabel(h: number): string {
  if (h === 0) return "12 AM"
  if (h === 12) return "12 PM"
  return h < 12 ? `${h} AM` : `${h - 12} PM`
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

interface AgendaPanelProps {
  open: boolean
  onClose: () => void
}

export function AgendaPanel({ open, onClose }: AgendaPanelProps) {
  const { data: status } = useGoogleStatus()
  const [selectedDate, setSelectedDate] = useState(() => new Date())
  const [now, setNow] = useState(() => new Date())

  const { data: events, isLoading } = useDayEvents(open && !!status?.connected, selectedDate)

  useEffect(() => {
    if (!open) return
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [open])

  // Reseta pro dia de hoje toda vez que o painel abre de novo.
  useEffect(() => {
    if (open) setSelectedDate(new Date())
  }, [open])

  const dateLabel = selectedDate.toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  })

  const hourRows = Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, i) => DAY_START_HOUR + i)

  const minutesFromStart = (d: Date) =>
    Math.max(0, Math.min((DAY_END_HOUR - DAY_START_HOUR) * 60, (d.getHours() - DAY_START_HOUR) * 60 + d.getMinutes()))

  const timed = useMemo(() => (events ?? []).filter((e) => !e.all_day), [events])
  const allDay = useMemo(() => (events ?? []).filter((e) => e.all_day), [events])

  const posFor = (e: CalendarEvent) => {
    const s = new Date(e.start)
    const en = new Date(e.end)
    const top = (minutesFromStart(s) / 60) * HOUR_PX
    const height = Math.max(20, ((minutesFromStart(en) - minutesFromStart(s)) / 60) * HOUR_PX)
    return { top, height }
  }

  const isToday = sameDay(selectedDate, now)
  const nowTop = (minutesFromStart(now) / 60) * HOUR_PX

  return (
    <AnimatePresence>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={onClose} />
          <motion.aside
            initial={{ x: 24, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 24, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="fixed right-3 top-[68px] z-50 flex h-[calc(100vh-88px)] w-[300px] flex-col overflow-hidden rounded-2xl border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-900 shadow-pop"
          >
            {/* Cabeçalho */}
            <div className="shrink-0 border-b border-paper-100 dark:border-ink-800 px-3.5 pb-2.5 pt-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-paper-400">Agenda</p>
                <div className="flex items-center gap-0.5">
                  <Link
                    to="/app/integrations"
                    onClick={onClose}
                    title="Abrir agenda completa"
                    className="grid size-6 place-items-center rounded-md text-paper-400 hover:bg-paper-100 dark:hover:bg-ink-800 hover:text-ink dark:hover:text-paper"
                  >
                    <ExternalLink className="size-3.5" />
                  </Link>
                  <button
                    onClick={onClose}
                    className="grid size-6 place-items-center rounded-md text-paper-400 hover:bg-paper-100 dark:hover:bg-ink-800 hover:text-ink dark:hover:text-paper"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              </div>

              <button
                onClick={() => setSelectedDate(new Date())}
                className="mt-1 flex items-center gap-1 text-sm font-semibold capitalize text-brand-600 dark:text-brand-400"
              >
                {dateLabel} <ChevronDown className="size-3.5" />
              </button>

              <div className="mt-2.5 flex items-center justify-between">
                <button
                  onClick={() => setSelectedDate(new Date())}
                  className="rounded-full border border-paper-200 dark:border-ink-700 px-3 py-1 text-xs font-medium text-ink dark:text-paper hover:bg-paper-100 dark:hover:bg-ink-800"
                >
                  Hoje
                </button>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setSelectedDate((d) => addDays(d, -1))}
                    className="grid size-6 place-items-center rounded-md text-paper-400 hover:bg-paper-100 dark:hover:bg-ink-800 hover:text-ink dark:hover:text-paper"
                  >
                    <ChevronLeft className="size-4" />
                  </button>
                  <button
                    onClick={() => setSelectedDate((d) => addDays(d, 1))}
                    className="grid size-6 place-items-center rounded-md text-paper-400 hover:bg-paper-100 dark:hover:bg-ink-800 hover:text-ink dark:hover:text-paper"
                  >
                    <ChevronRight className="size-4" />
                  </button>
                </div>
              </div>
            </div>

            {!status?.connected ? (
              <div className="space-y-3 p-5 text-center">
                <p className="text-sm text-paper-500">Conecte o Google para ver sua agenda aqui.</p>
                <Link
                  to="/app/integrations"
                  onClick={onClose}
                  className="inline-block rounded-lg bg-brand-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-brand-700"
                >
                  Conectar Google
                </Link>
              </div>
            ) : (
              <>
                {/* Eventos de dia inteiro */}
                {allDay.length > 0 && (
                  <div className="shrink-0 space-y-1 border-b border-paper-100 dark:border-ink-800 px-3 py-1.5">
                    {allDay.map((e) => (
                      <a
                        key={e.event_id}
                        href={e.html_link}
                        target="_blank"
                        rel="noreferrer"
                        className="block truncate rounded bg-brand-500/15 px-1.5 py-0.5 text-[11px] font-medium text-brand-700 dark:text-brand-300 hover:bg-brand-500/25"
                      >
                        {e.title}
                      </a>
                    ))}
                  </div>
                )}

                {/* Grade do dia */}
                <div
                  className="flex-1 overflow-y-auto scrollbar-slim"
                  ref={(el) => {
                    if (el && el.dataset.scrolled !== "1") {
                      el.dataset.scrolled = "1"
                      el.scrollTop = Math.max(0, (DEFAULT_SCROLL_HOUR - DAY_START_HOUR) * HOUR_PX - 24)
                    }
                  }}
                >
                  {isLoading ? (
                    <div className="flex justify-center py-10">
                      <Spinner className="size-4" />
                    </div>
                  ) : (
                    <div className="relative grid grid-cols-[44px_1fr] px-1">
                      <div>
                        {hourRows.map((h) => (
                          <div
                            key={h}
                            style={{ height: HOUR_PX }}
                            className="border-t border-paper-100 dark:border-ink-800 pr-1.5 pt-0.5 text-right text-[10px] text-paper-400"
                          >
                            {h > DAY_START_HOUR && hourLabel(h)}
                          </div>
                        ))}
                      </div>
                      <div className="relative border-l border-paper-100 dark:border-ink-800">
                        {hourRows.map((h) => (
                          <div key={h} style={{ height: HOUR_PX }} className="border-t border-paper-100 dark:border-ink-800" />
                        ))}

                        {isToday && (
                          <div style={{ top: nowTop }} className="pointer-events-none absolute inset-x-0 z-10 flex items-center">
                            <span className="-ml-[3px] size-2 shrink-0 rounded-full bg-red-500 dark:bg-red-400" />
                            <span className="h-[2px] w-full bg-red-500 dark:bg-red-400" />
                          </div>
                        )}

                        {timed.map((e) => {
                          const { top, height } = posFor(e)
                          const time = new Date(e.start).toLocaleTimeString("pt-BR", { hour: "numeric", minute: "2-digit" })
                          return (
                            <a
                              key={e.event_id}
                              href={e.meet_link ?? e.html_link}
                              target="_blank"
                              rel="noreferrer"
                              style={{ top, height }}
                              className={cx(
                                "absolute inset-x-0.5 overflow-hidden rounded-md px-1.5 py-0.5 text-left text-[10px] font-medium leading-tight text-white shadow-sm transition-colors",
                                "bg-brand-600 hover:bg-brand-700",
                              )}
                            >
                              <span className="flex items-center gap-1 truncate">
                                {e.meet_link && <Video className="size-2.5 shrink-0" />}
                                {e.title}
                                {height > 28 && `, ${time}`}
                              </span>
                            </a>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
