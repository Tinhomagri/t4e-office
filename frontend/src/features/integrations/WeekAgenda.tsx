// Agenda semanal própria — substitui o embed do Google (calendar.google.com/embed).
// O embed é um iframe cross-origin: não dá pra interceptar clique em evento nem
// injetar o link do Meet no popup nativo do Google. Aqui os dados vêm da nossa
// API (que já expõe meet_link) e o popup de clique é nosso.
import { CalendarClock, ChevronLeft, ChevronRight, ExternalLink, Video, X } from "lucide-react"
import { useState } from "react"

import { Spinner, cx } from "@/shared/ui/primitives"
import { useWeekEvents } from "./integrations.hooks"
import type { CalendarEvent } from "./integrations.types"

const DAY_START_HOUR = 7
const DAY_END_HOUR = 21
const HOUR_PX = 56

function startOfWeek(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const dow = (x.getDay() + 6) % 7 // segunda = 0
  x.setDate(x.getDate() - dow)
  return x
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

const WEEKDAY_SHORT = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"]

export function WeekAgenda() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const { data: events, isLoading } = useWeekEvents(true, weekStart)
  const [selected, setSelected] = useState<CalendarEvent | null>(null)

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    return d
  })

  const today = new Date()
  const monthLabel = weekStart.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })

  const timed = (events ?? []).filter((e) => !e.all_day)
  const allDay = (events ?? []).filter((e) => e.all_day)

  const eventsFor = (day: Date) => timed.filter((e) => sameDay(new Date(e.start), day))
  const allDayFor = (day: Date) => allDay.filter((e) => sameDay(new Date(e.start), day))

  const hourRows = Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, i) => DAY_START_HOUR + i)

  const posFor = (e: CalendarEvent) => {
    const s = new Date(e.start)
    const en = new Date(e.end)
    const minutesFromStart = (d: Date) =>
      Math.max(0, Math.min((DAY_END_HOUR - DAY_START_HOUR) * 60, (d.getHours() - DAY_START_HOUR) * 60 + d.getMinutes()))
    const top = (minutesFromStart(s) / 60) * HOUR_PX
    const height = Math.max(20, ((minutesFromStart(en) - minutesFromStart(s)) / 60) * HOUR_PX)
    return { top, height }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-900 shadow-card">
      <div className="flex items-center justify-between gap-3 border-b border-paper-100 dark:border-ink-800 px-5 py-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-ink dark:text-paper">
          <CalendarClock className="size-4" /> Sua agenda
          <span className="font-normal capitalize text-paper-400">· {monthLabel}</span>
        </h3>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setWeekStart(startOfWeek(new Date()))}
            className="mr-1 rounded-lg px-2.5 py-1 text-xs font-medium text-paper-500 hover:bg-paper-100 dark:hover:bg-ink-800 hover:text-ink dark:hover:text-paper"
          >
            Hoje
          </button>
          <button
            onClick={() => setWeekStart((d) => new Date(d.getTime() - 7 * 86_400_000))}
            className="grid size-7 place-items-center rounded-lg text-paper-400 hover:bg-paper-100 dark:hover:bg-ink-800 hover:text-ink dark:hover:text-paper"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            onClick={() => setWeekStart((d) => new Date(d.getTime() + 7 * 86_400_000))}
            className="grid size-7 place-items-center rounded-lg text-paper-400 hover:bg-paper-100 dark:hover:bg-ink-800 hover:text-ink dark:hover:text-paper"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner className="size-5" />
        </div>
      ) : (
        <div className="overflow-x-auto scrollbar-slim">
          <div className="min-w-[720px]">
            {/* Cabeçalho dos dias */}
            <div className="grid grid-cols-[48px_repeat(7,1fr)] border-b border-paper-100 dark:border-ink-800">
              <div />
              {days.map((d) => (
                <div key={d.toISOString()} className="border-l border-paper-100 dark:border-ink-800 px-2 py-2 text-center">
                  <p className="text-[11px] uppercase text-paper-400">{WEEKDAY_SHORT[(d.getDay() + 6) % 7]}</p>
                  <p
                    className={cx(
                      "mx-auto mt-0.5 grid size-6 place-items-center rounded-full text-sm font-semibold",
                      sameDay(d, today) ? "bg-brand-500 text-white" : "text-ink dark:text-paper",
                    )}
                  >
                    {d.getDate()}
                  </p>
                </div>
              ))}
            </div>

            {/* Eventos de dia inteiro */}
            {allDay.length > 0 && (
              <div className="grid grid-cols-[48px_repeat(7,1fr)] border-b border-paper-100 dark:border-ink-800">
                <div className="py-1.5 text-center text-[10px] text-paper-400">dia</div>
                {days.map((d) => (
                  <div key={d.toISOString()} className="space-y-1 border-l border-paper-100 dark:border-ink-800 p-1">
                    {allDayFor(d).map((e) => (
                      <button
                        key={e.event_id}
                        onClick={() => setSelected(e)}
                        className="block w-full truncate rounded bg-brand-500/15 px-1.5 py-0.5 text-left text-[11px] font-medium text-brand-700 dark:text-brand-300 hover:bg-brand-500/25"
                      >
                        {e.title}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {/* Grade de horários */}
            <div className="relative grid grid-cols-[48px_repeat(7,1fr)]">
              <div>
                {hourRows.map((h) => (
                  <div key={h} style={{ height: HOUR_PX }} className="border-t border-paper-100 dark:border-ink-800 pr-1.5 text-right text-[10px] text-paper-400">
                    {h}h
                  </div>
                ))}
              </div>
              {days.map((d) => (
                <div
                  key={d.toISOString()}
                  className="relative border-l border-paper-100 dark:border-ink-800"
                >
                  {hourRows.map((h) => (
                    <div key={h} style={{ height: HOUR_PX }} className="border-t border-paper-100 dark:border-ink-800" />
                  ))}
                  {eventsFor(d).map((e) => {
                    const { top, height } = posFor(e)
                    return (
                      <button
                        key={e.event_id}
                        onClick={() => setSelected(e)}
                        style={{ top, height }}
                        className={cx(
                          "absolute inset-x-0.5 overflow-hidden rounded-md border-l-2 px-1.5 py-1 text-left text-[11px] leading-tight shadow-sm transition-colors",
                          e.meet_link
                            ? "border-brand-500 bg-brand-500/15 text-brand-700 hover:bg-brand-500/25 dark:text-brand-300"
                            : "border-ink-300 bg-paper-100 text-ink dark:border-ink-600 dark:bg-ink-800 dark:text-paper",
                        )}
                      >
                        <span className="block truncate font-semibold">{e.title}</span>
                        {height > 32 && (
                          <span className="block truncate text-[10px] opacity-80">
                            {new Date(e.start).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {selected && <EventPopover event={selected} onClose={() => setSelected(null)} />}
    </section>
  )
}

function EventPopover({ event, onClose }: { event: CalendarEvent; onClose: () => void }) {
  const t = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  const dateLabel = new Date(event.start).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink-950/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm animate-scale-in rounded-2xl border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-900 p-5 shadow-pop">
        <button
          onClick={onClose}
          className="absolute right-3 top-3 grid size-7 place-items-center rounded-lg text-paper-400 hover:bg-paper-100 dark:hover:bg-ink-800 hover:text-ink dark:hover:text-paper"
        >
          <X className="size-4" />
        </button>
        <p className="pr-8 text-base font-semibold text-ink dark:text-paper">{event.title}</p>
        <p className="mt-1 text-sm capitalize text-paper-500">
          {dateLabel} · {event.all_day ? "Dia inteiro" : `${t(event.start)} – ${t(event.end)}`}
        </p>

        {event.attendees.length > 0 && (
          <p className="mt-2 text-xs text-paper-400">
            {event.attendees.length} participante{event.attendees.length !== 1 ? "s" : ""}
          </p>
        )}

        <div className="mt-4 flex flex-col gap-2">
          {event.meet_link ? (
            <a
              href={event.meet_link}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
            >
              <Video className="size-4" /> Entrar na call
            </a>
          ) : (
            <p className="rounded-lg bg-paper-50 dark:bg-ink-800 px-3 py-2 text-xs text-paper-400">
              Este evento não tem link de Meet.
            </p>
          )}
          <a
            href={event.html_link}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-1.5 text-sm text-paper-500 hover:text-ink dark:hover:text-paper"
          >
            Ver no Google Agenda <ExternalLink className="size-3.5" />
          </a>
        </div>
      </div>
    </div>
  )
}
