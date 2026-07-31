// Agenda semanal própria — substitui o embed do Google (calendar.google.com/embed).
// O embed é um iframe cross-origin: não dá pra interceptar clique em evento nem
// injetar o link do Meet no popup nativo do Google. Aqui os dados vêm da nossa
// API (que já expõe meet_link) e o popup de clique é nosso.
//
// Paleta e forma inspiradas no Meet real (inspecionado via devtools em
// meet.google.com/home): cards em cinza neutro bem arredondado (rounded-2xl),
// botões em pílula (rounded-full) com preenchimento pastel, tira de dias com
// círculo cheio no dia ativo.
import { AnimatePresence, motion } from "framer-motion"
import {
  AlertCircle,
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Pencil,
  Repeat,
  Trash2,
  Users,
  Video,
  X,
} from "lucide-react"
import { useEffect, useState } from "react"

import { extractApiError } from "@/shared/api/client"
import { Button, Spinner, cx } from "@/shared/ui/primitives"
import { AttendeeAvatar, LiveField, dayLabel } from "./IntegrationsPage"
import { useCancelMeeting, useUpdateMeeting, useWeekEvents } from "./integrations.hooks"
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
  const [now, setNow] = useState(() => new Date())

  // Reposiciona a linha do horário atual a cada minuto.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    return d
  })

  const monthLabel = weekStart.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })

  const timed = (events ?? []).filter((e) => !e.all_day)
  const allDay = (events ?? []).filter((e) => e.all_day)

  const eventsFor = (day: Date) => timed.filter((e) => sameDay(new Date(e.start), day))
  const allDayFor = (day: Date) => allDay.filter((e) => sameDay(new Date(e.start), day))

  const hourRows = Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, i) => DAY_START_HOUR + i)

  const minutesFromStart = (d: Date) =>
    Math.max(0, Math.min((DAY_END_HOUR - DAY_START_HOUR) * 60, (d.getHours() - DAY_START_HOUR) * 60 + d.getMinutes()))

  const posFor = (e: CalendarEvent) => {
    const s = new Date(e.start)
    const en = new Date(e.end)
    const top = (minutesFromStart(s) / 60) * HOUR_PX
    const height = Math.max(20, ((minutesFromStart(en) - minutesFromStart(s)) / 60) * HOUR_PX)
    return { top, height }
  }

  // Só mostra a linha do horário atual dentro da janela visível (7h–21h).
  const showNowLine =
    now.getHours() >= DAY_START_HOUR && now.getHours() < DAY_END_HOUR
  const nowTop = (minutesFromStart(now) / 60) * HOUR_PX

  return (
    <section className="overflow-hidden rounded-2xl border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-900 shadow-card">
      <div className="flex items-center justify-between gap-3 border-b border-paper-100 dark:border-ink-800 px-5 py-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-ink dark:text-paper">
          <CalendarClock className="size-4" /> Sua agenda
          <span className="font-normal capitalize text-paper-400">· {monthLabel}</span>
        </h3>
        {/* Pílulas de navegação — mesma forma (rounded-full) do "Nova"/"Hoje" do Meet real. */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setWeekStart(startOfWeek(new Date()))}
            className="mr-1 rounded-full px-3 py-1.5 text-xs font-semibold text-paper-500 hover:bg-paper-100 dark:hover:bg-ink-800 hover:text-ink dark:hover:text-paper"
          >
            Hoje
          </button>
          <button
            onClick={() => setWeekStart((d) => new Date(d.getTime() - 7 * 86_400_000))}
            className="grid size-7 place-items-center rounded-full text-paper-400 hover:bg-paper-100 dark:hover:bg-ink-800 hover:text-ink dark:hover:text-paper"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            onClick={() => setWeekStart((d) => new Date(d.getTime() + 7 * 86_400_000))}
            className="grid size-7 place-items-center rounded-full text-paper-400 hover:bg-paper-100 dark:hover:bg-ink-800 hover:text-ink dark:hover:text-paper"
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
            {/* Cabeçalho dos dias — círculo cheio no dia atual, como no Meet. */}
            <div className="grid grid-cols-[48px_repeat(7,1fr)] border-b border-paper-100 dark:border-ink-800">
              <div />
              {days.map((d) => (
                <div key={d.toISOString()} className="border-l border-paper-100 dark:border-ink-800 px-2 py-2 text-center">
                  <p className="text-[11px] uppercase text-paper-400">{WEEKDAY_SHORT[(d.getDay() + 6) % 7]}</p>
                  <p
                    className={cx(
                      "mx-auto mt-0.5 grid size-6 place-items-center rounded-full text-sm font-semibold",
                      sameDay(d, now) ? "bg-brand-500 text-white" : "text-ink dark:text-paper",
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
                        className="block w-full truncate rounded-full bg-brand-500/15 px-2 py-0.5 text-left text-[11px] font-medium text-brand-700 dark:text-brand-300 hover:bg-brand-500/25"
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
                  {showNowLine && sameDay(d, now) && (
                    <div
                      style={{ top: nowTop }}
                      className="pointer-events-none absolute inset-x-0 z-10 flex items-center"
                    >
                      <span className="-ml-[3px] size-2 shrink-0 rounded-full bg-red-500 dark:bg-red-400" />
                      <span className="h-[2px] w-full bg-red-500 dark:bg-red-400" />
                    </div>
                  )}
                  {eventsFor(d).map((e) => {
                    const { top, height } = posFor(e)
                    return (
                      <button
                        key={e.event_id}
                        onClick={() => setSelected(e)}
                        style={{ top, height }}
                        className={cx(
                          "absolute inset-x-0.5 overflow-hidden rounded-lg border-l-[3px] px-1.5 py-1 text-left text-[11px] leading-tight shadow-sm transition-colors",
                          e.meet_link
                            ? "border-brand-500 bg-brand-500/15 text-brand-700 hover:bg-brand-500/25 dark:text-brand-300"
                            : "border-paper-300 bg-paper-100 text-ink hover:bg-paper-200 dark:border-ink-600 dark:bg-ink-800 dark:text-paper dark:hover:bg-ink-700",
                        )}
                      >
                        <span className="flex items-center gap-1 truncate font-semibold">
                          {e.recurring_event_id && <Repeat className="size-2.5 shrink-0 opacity-70" />}
                          {e.title}
                        </span>
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

      <AnimatePresence>
        {selected && <EventDetailModal event={selected} onClose={() => setSelected(null)} />}
      </AnimatePresence>
    </section>
  )
}

// ─── detalhe do evento: ver, editar, cancelar ──────────────────────────────

// Descrição de evento do Google costuma vir como HTML (o composer web deles
// grava rich text) — usa o parser do browser só pra extrair o texto, nunca
// injeta o HTML de volta na página.
function stripHtml(html: string): string {
  return new DOMParser().parseFromString(html, "text/html").body.textContent?.trim() ?? html
}

function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function EventDetailModal({ event, onClose }: { event: CalendarEvent; onClose: () => void }) {
  const update = useUpdateMeeting()
  const cancel = useCancelMeeting()
  const [mode, setMode] = useState<"view" | "edit" | "confirm-cancel">("view")
  const [title, setTitle] = useState(event.title)
  const [start, setStart] = useState(toLocalInput(event.start))
  const [durationMin, setDurationMin] = useState(
    Math.max(5, Math.round((new Date(event.end).getTime() - new Date(event.start).getTime()) / 60_000)),
  )
  const [error, setError] = useState<string | null>(null)

  const t = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })

  const handleSaveEdit = async () => {
    setError(null)
    try {
      const startDate = new Date(start)
      const endDate = new Date(startDate.getTime() + durationMin * 60_000)
      await update.mutateAsync({
        eventId: event.event_id,
        input: { title, start: startDate.toISOString(), end: endDate.toISOString() },
      })
      onClose()
    } catch (e) {
      setError(extractApiError(e))
    }
  }

  const handleCancel = async () => {
    setError(null)
    try {
      await cancel.mutateAsync(event.event_id)
      onClose()
    } catch (e) {
      setError(extractApiError(e))
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-ink-950/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.98 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        // Card em cinza neutro bem arredondado — a "cara" do painel de detalhe
        // do Meet, não um branco/borda genérico.
        className="relative z-10 w-full max-w-md overflow-hidden rounded-3xl bg-paper-50 dark:bg-ink-800 shadow-pop"
      >
        <div className="flex items-start justify-between gap-3 px-6 pt-5">
          {mode === "edit" ? (
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full border-none bg-transparent text-lg font-bold text-ink outline-none dark:text-paper"
            />
          ) : (
            <h2 className="pr-8 text-lg font-bold text-ink dark:text-paper">{event.title}</h2>
          )}
          <button
            onClick={onClose}
            className="grid size-8 shrink-0 place-items-center rounded-full text-paper-400 transition-colors hover:bg-paper-200 dark:hover:bg-ink-700 hover:text-ink dark:hover:text-paper"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          {mode === "edit" ? (
            <>
              <LiveField icon={Clock} label="Início">
                <input
                  type="datetime-local"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  className="w-full border-none bg-transparent text-[15px] text-ink outline-none dark:text-paper [color-scheme:light] dark:[color-scheme:dark]"
                />
              </LiveField>
              <LiveField icon={Clock} label="Duração (min)">
                <input
                  type="number"
                  min={5}
                  step={5}
                  value={durationMin}
                  onChange={(e) => setDurationMin(Number(e.target.value))}
                  className="w-full border-none bg-transparent text-[15px] text-ink outline-none dark:text-paper"
                />
              </LiveField>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2.5 text-sm text-paper-600 dark:text-paper-300">
                <Clock className="size-4 shrink-0 text-paper-400" />
                <span className="capitalize">
                  {dayLabel(event.start, event.all_day)} · {event.all_day ? "Dia inteiro" : `${t(event.start)} – ${t(event.end)}`}
                </span>
                {event.recurring_event_id && (
                  <span className="flex items-center gap-1 rounded-full bg-paper-200 dark:bg-ink-700 px-2 py-0.5 text-[11px] font-medium text-paper-500">
                    <Repeat className="size-3" /> recorrente
                  </span>
                )}
              </div>

              {event.attendees.length > 0 && (
                <div className="flex items-start gap-2.5 text-sm text-paper-600 dark:text-paper-300">
                  <Users className="mt-0.5 size-4 shrink-0 text-paper-400" />
                  <div className="flex flex-wrap items-center gap-1.5">
                    {event.attendees.map((a) => (
                      <span
                        key={a}
                        className="flex items-center gap-1.5 rounded-full bg-paper-200 dark:bg-ink-700 py-1 pl-1 pr-2.5 text-xs font-medium"
                      >
                        <AttendeeAvatar email={a} size="xs" />
                        {a}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {event.description && (
                <p className="whitespace-pre-wrap rounded-2xl bg-paper-100 dark:bg-ink-900/60 px-3.5 py-3 text-sm text-paper-600 dark:text-paper-300">
                  {stripHtml(event.description)}
                </p>
              )}
            </>
          )}

          {error && (
            <p className="flex items-center gap-2 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
              <AlertCircle className="size-4 shrink-0" /> {error}
            </p>
          )}

          {mode === "confirm-cancel" && (
            <div className="rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3">
              <p className="text-sm font-medium text-danger">Cancelar esta reunião?</p>
              <p className="mt-0.5 text-xs text-paper-500">Os convidados recebem o aviso de cancelamento por e-mail.</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-paper-100 dark:border-ink-700 px-6 py-4">
          {mode === "view" && (
            <>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setMode("edit")}
                  title="Editar"
                  className="grid size-9 place-items-center rounded-full text-paper-400 transition-colors hover:bg-paper-200 dark:hover:bg-ink-700 hover:text-ink dark:hover:text-paper"
                >
                  <Pencil className="size-4" />
                </button>
                <button
                  onClick={() => setMode("confirm-cancel")}
                  title="Cancelar reunião"
                  className="grid size-9 place-items-center rounded-full text-paper-400 transition-colors hover:bg-danger/10 hover:text-danger"
                >
                  <Trash2 className="size-4" />
                </button>
                <a
                  href={event.html_link}
                  target="_blank"
                  rel="noreferrer"
                  title="Ver no Google Agenda"
                  className="grid size-9 place-items-center rounded-full text-paper-400 transition-colors hover:bg-paper-200 dark:hover:bg-ink-700 hover:text-ink dark:hover:text-paper"
                >
                  <ExternalLink className="size-4" />
                </a>
              </div>
              {/* Pílula sólida verde — mesma linguagem do CTA "Nova" do Meet real. */}
              {event.meet_link ? (
                <a
                  href={event.meet_link}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-full bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
                >
                  <Video className="size-4" /> Entrar na call
                </a>
              ) : (
                <span className="text-xs text-paper-400">Sem link de Meet</span>
              )}
            </>
          )}

          {mode === "edit" && (
            <>
              <Button variant="ghost" onClick={() => setMode("view")}>
                Cancelar
              </Button>
              <Button icon={<Check className="size-4" />} loading={update.isPending} onClick={handleSaveEdit}>
                Salvar
              </Button>
            </>
          )}

          {mode === "confirm-cancel" && (
            <>
              <Button variant="ghost" onClick={() => setMode("view")}>
                Voltar
              </Button>
              <Button
                variant="danger"
                icon={<Trash2 className="size-4" />}
                loading={cancel.isPending}
                onClick={handleCancel}
              >
                Cancelar reunião
              </Button>
            </>
          )}
        </div>
      </motion.div>
    </div>
  )
}
