import { AnimatePresence, motion } from "framer-motion"
import {
  AlertCircle,
  BarChart3,
  CalendarClock,
  CalendarPlus,
  CalendarX2,
  Check,
  Clock,
  ExternalLink,
  Link2,
  Mail,
  Repeat,
  Sparkles,
  Type,
  Unplug,
  Users,
  Video,
  X,
} from "lucide-react"
import { useEffect, useState, type ReactNode } from "react"
import { useSearchParams } from "react-router-dom"

import { extractApiError } from "@/shared/api/client"
import {
  Badge,
  Button,
  cx,
  PageHeader,
  Spinner,
} from "@/shared/ui/primitives"
import {
  useConnectGoogle,
  useCreateMeeting,
  useDisconnectGoogle,
  useGoogleStatus,
  useUpcomingEvents,
} from "./integrations.hooks"
import { MeetingReportPanel } from "./MeetingReportPanel"
import { buildRecurrence, RECURRENCE_OPTIONS } from "./recurrence"
import type { RecurrenceFreq } from "./integrations.types"
import { WeekAgenda } from "./WeekAgenda"

// Avatar com gradiente determinístico por e-mail — mesma técnica usada em
// Boards/Poker, reimplementada aqui pra manter a feature autocontida.
const AVATAR_GRADIENTS = [
  "from-violet-500 to-purple-700",
  "from-blue-500 to-indigo-700",
  "from-emerald-500 to-teal-700",
  "from-rose-500 to-pink-700",
  "from-amber-500 to-orange-700",
  "from-cyan-500 to-sky-700",
]
export function gradientFor(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) & 0xffff
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length]
}
export function AttendeeAvatar({ email, size = "sm" }: { email: string; size?: "xs" | "sm" }) {
  const initials = email.slice(0, 2).toUpperCase()
  return (
    <span
      title={email}
      className={cx(
        "grid shrink-0 place-items-center rounded-full bg-gradient-to-br font-semibold text-white ring-2 ring-paper dark:ring-ink-900",
        gradientFor(email),
        size === "xs" ? "size-5 text-[8px]" : "size-7 text-[10px]",
      )}
    >
      {initials}
    </span>
  )
}

export function dayLabel(iso: string, allDay?: boolean): string {
  const d = new Date(iso)
  const now = new Date()
  // Evento "dia inteiro" chega como UTC-midnight puro (sem hora local de verdade) —
  // usar getUTC* evita que timezones negativos (ex.: UTC-3) empurrem a data 1 dia p/ trás.
  const startOfDay = allDay
    ? (x: Date) => Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate())
    : (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diffDays = Math.round((startOfDay(d) - startOfDay(now)) / 86_400_000)
  if (diffDays === 0) return "Hoje"
  if (diffDays === 1) return "Amanhã"
  return allDay
    ? d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "short", timeZone: "UTC" })
    : d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "short" })
}

function timeRange(startIso: string, endIso: string, allDay?: boolean): string {
  if (allDay) return "Dia inteiro"
  const t = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  return `${t(startIso)} – ${t(endIso)}`
}

// "em 12 min" / "em 3h" / "agora" — só para a próxima reunião em destaque.
function countdown(startIso: string): string | null {
  const diffMs = new Date(startIso).getTime() - Date.now()
  if (diffMs < -5 * 60_000) return null
  if (diffMs <= 0) return "agora"
  const mins = Math.round(diffMs / 60_000)
  if (mins < 60) return `em ${mins} min`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `em ${hours}h`
  return null
}

export function IntegrationsPage() {
  const status = useGoogleStatus()
  const connect = useConnectGoogle()
  const disconnect = useDisconnectGoogle()
  const connected = status.data?.connected ?? false
  const events = useUpcomingEvents(connected)

  const [params, setParams] = useSearchParams()
  const [banner, setBanner] = useState<string | null>(null)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)

  // Lê o resultado do callback OAuth (?google=connected|denied|error).
  useEffect(() => {
    const r = params.get("google")
    if (!r) return
    const map: Record<string, string> = {
      connected: "Conta Google conectada com sucesso.",
      denied: "Permissão negada. A conexão não foi concluída.",
      error: "Não foi possível conectar ao Google. Tente novamente.",
    }
    setBanner(map[r] ?? null)
    params.delete("google")
    setParams(params, { replace: true })
    status.refetch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const list = events.data ?? []
  const [next] = list
  const nextCountdown = next && !next.all_day ? countdown(next.start) : null

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <>
            <CalendarClock className="size-4 text-brand-500" />
            <span>Reuniões</span>
          </>
        }
        title="Reuniões"
        subtitle="Conecte o Google e agende calls com Meet direto da sua agenda"
      >
        {connected && (
          <div className="flex items-center gap-2">
            {/* Pílula outline — mesma forma dos toggles do Meet real, contraste
                menor que o CTA principal de agendar. */}
            <button
              onClick={() => setReportOpen((v) => !v)}
              className={cx(
                "inline-flex h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors",
                reportOpen
                  ? "border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-500/40 dark:bg-brand-500/10 dark:text-brand-300"
                  : "border-paper-200 dark:border-ink-700 text-paper-500 hover:bg-paper-100 dark:hover:bg-ink-800 hover:text-ink dark:hover:text-paper",
              )}
            >
              <BarChart3 className="size-4" /> Relatório
            </button>
            <Button
              icon={<CalendarPlus className="size-4" />}
              onClick={() => setScheduleOpen(true)}
              className="!rounded-full"
            >
              Agendar reunião
            </Button>
          </div>
        )}
      </PageHeader>

      {banner && (
        <div className="flex items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 dark:border-brand-500/30 dark:bg-brand-500/10 px-4 py-3 text-sm text-brand-700 dark:text-brand-300">
          <Sparkles className="size-4 shrink-0" />
          {banner}
        </div>
      )}

      {/* Cartão de conexão Google */}
      <section className="relative overflow-hidden rounded-2xl border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-900 p-5 shadow-card">
        <span
          className={cx(
            "absolute inset-x-0 top-0 h-1 bg-gradient-to-r",
            connected ? "from-green-500 to-emerald-400" : "from-blue-500 to-cyan-400",
          )}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              className={cx(
                "grid size-10 place-items-center rounded-xl",
                connected
                  ? "bg-green-100 text-green-600 dark:bg-green-500/15 dark:text-green-400"
                  : "bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400",
              )}
            >
              <Link2 className="size-5" />
            </span>
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold text-ink dark:text-paper">
                Google Agenda
                {connected ? (
                  <Badge tone="success">Conectado</Badge>
                ) : status.data?.status === "revoked" ? (
                  <Badge tone="warning">Reconecte</Badge>
                ) : (
                  <Badge tone="neutral">Não conectado</Badge>
                )}
              </h3>
              <p className="mt-1 text-xs text-paper-500">
                {connected
                  ? `Vinculado a ${status.data?.google_email}`
                  : "Autorize o acesso à sua agenda para criar reuniões com Google Meet."}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {connected ? (
              <Button
                variant="ghost"
                icon={<Unplug className="size-4" />}
                loading={disconnect.isPending}
                onClick={() => disconnect.mutate()}
                className="!rounded-full"
              >
                Desconectar
              </Button>
            ) : (
              <Button loading={connect.isPending} onClick={() => connect.mutate()} className="!rounded-full">
                Conectar Google
              </Button>
            )}
          </div>
        </div>
      </section>

      {!connected && (
        <section className="rounded-2xl border border-dashed border-paper-300 dark:border-ink-700 bg-paper-50 dark:bg-ink-900/60 p-12 text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-blue-100 text-blue-500 dark:bg-blue-500/15 dark:text-blue-400">
            <CalendarClock className="size-7" />
          </div>
          <p className="mt-4 text-base font-semibold text-ink dark:text-paper">Sua agenda ainda não está conectada</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-paper-400">
            Conecte o Google para ver seus próximos eventos aqui e agendar reuniões com link de Meet sem sair do Pulse.
          </p>
        </section>
      )}

      {/* Próxima reunião em destaque */}
      {connected && events.isLoading && (
        <div className="flex justify-center py-10">
          <Spinner className="size-5" />
        </div>
      )}

      {connected && events.isError && (
        <p className="rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
          {extractApiError(events.error)}
        </p>
      )}

      {connected && !events.isLoading && !events.isError && list.length === 0 && (
        <section className="rounded-2xl border border-dashed border-paper-300 dark:border-ink-700 bg-paper-50 dark:bg-ink-900/60 p-12 text-center">
          <CalendarX2 className="mx-auto size-10 text-paper-300" />
          <p className="mt-3 text-base font-semibold text-ink dark:text-paper">Nenhum evento agendado</p>
          <p className="mt-1 text-sm text-paper-400">Sua agenda está livre. Que tal agendar a próxima call do time?</p>
          <Button className="mx-auto mt-4" icon={<CalendarPlus className="size-4" />} onClick={() => setScheduleOpen(true)}>
            Agendar reunião
          </Button>
        </section>
      )}

      {connected && next && (
        <section className="relative overflow-hidden rounded-2xl border border-brand-200 dark:border-brand-500/30 bg-gradient-to-br from-brand-50 to-white dark:from-brand-500/10 dark:to-ink-900 p-6 shadow-card">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-400">
                <Sparkles className="size-3.5" /> Próxima reunião{nextCountdown ? ` · ${nextCountdown}` : ""}
              </p>
              <h2 className="mt-1 truncate text-xl font-bold text-ink dark:text-paper">{next.title}</h2>
              <p className="mt-1 text-sm text-paper-500">
                {dayLabel(next.start, next.all_day)} · {timeRange(next.start, next.end, next.all_day)}
              </p>
              {next.attendees.length > 0 && (
                <div className="mt-3 flex items-center gap-2">
                  <div className="flex -space-x-1.5">
                    {next.attendees.slice(0, 6).map((a) => (
                      <AttendeeAvatar key={a} email={a} />
                    ))}
                  </div>
                  <span className="text-xs text-paper-400">
                    {next.attendees.length} participante{next.attendees.length !== 1 ? "s" : ""}
                  </span>
                </div>
              )}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              {next.meet_link && (
                <a
                  href={next.meet_link}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-full bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
                >
                  <Video className="size-4" /> Entrar na call
                </a>
              )}
              <a
                href={next.html_link}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-paper-400 hover:text-ink dark:hover:text-paper"
              >
                Ver na agenda <ExternalLink className="size-3" />
              </a>
            </div>
          </div>
        </section>
      )}

      {connected && reportOpen && <MeetingReportPanel />}

      {/* A agenda em si — grade própria (não o embed do Google: aquele é um
          iframe cross-origin e nunca deixa a gente colocar o link do Meet
          no popup de clique). Dados vindos da nossa API, que já traz meet_link. */}
      {connected && <WeekAgenda />}

      <ScheduleMeetingModal open={scheduleOpen} onClose={() => setScheduleOpen(false)} />
    </div>
  )
}

const DURATION_PRESETS = [15, 30, 45, 60]

function parseAttendees(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}

function ScheduleMeetingModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateMeeting()
  const [title, setTitle] = useState("")
  const [start, setStart] = useState("")
  const [durationMin, setDurationMin] = useState(30)
  const [attendees, setAttendees] = useState("")
  const [description, setDescription] = useState("")
  const [recurrenceFreq, setRecurrenceFreq] = useState<RecurrenceFreq>("none")
  const [recurrenceCount, setRecurrenceCount] = useState(8)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const attendeeList = parseAttendees(attendees)
  const canSubmit = !!title.trim() && !!start

  const reset = () => {
    setTitle("")
    setStart("")
    setDurationMin(30)
    setAttendees("")
    setDescription("")
    setRecurrenceFreq("none")
    setRecurrenceCount(8)
    setError(null)
    setDone(null)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleSubmit = async () => {
    setError(null)
    try {
      const startDate = new Date(start)
      const endDate = new Date(startDate.getTime() + durationMin * 60_000)
      const result = await create.mutateAsync({
        title,
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        attendees: attendeeList,
        description,
        recurrence: buildRecurrence(recurrenceFreq, recurrenceCount),
      })
      setDone(result.meet_link ?? result.html_link)
    } catch (e) {
      setError(extractApiError(e))
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-ink-950/50 backdrop-blur-sm"
            onClick={handleClose}
          />
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 max-h-[92vh] w-full max-w-md overflow-hidden rounded-3xl border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-900 shadow-pop"
          >
            {done ? (
              <SuccessState meetLink={done} onClose={handleClose} />
            ) : (
              <>
                {/* Header em gradiente com blobs decorativos */}
                <div className="relative overflow-hidden bg-gradient-to-br from-brand-500 via-brand-600 to-indigo-700 px-6 py-6">
                  <div className="pointer-events-none absolute -right-8 -top-10 size-32 rounded-full bg-white/10 blur-2xl" />
                  <div className="pointer-events-none absolute -left-6 bottom-0 size-24 rounded-full bg-white/10 blur-xl" />
                  <button
                    onClick={handleClose}
                    className="absolute right-4 top-4 grid size-8 place-items-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
                  >
                    <X className="size-4" />
                  </button>
                  <div className="relative flex items-center gap-3">
                    <div className="grid size-11 place-items-center rounded-2xl bg-white/15 shadow-inner backdrop-blur">
                      <CalendarPlus className="size-5 text-white" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-white">Agendar reunião</h2>
                      <p className="mt-0.5 text-[13px] text-white/75">
                        Cria o evento com link do Meet e envia convites
                      </p>
                    </div>
                  </div>
                </div>

                <div className="max-h-[62vh] space-y-5 overflow-y-auto px-6 py-5 scrollbar-slim">
                  <LiveField icon={Type} label="Título">
                    <input
                      autoFocus
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Ex: Review do sprint"
                      className="w-full border-none bg-transparent text-[15px] font-medium text-ink outline-none placeholder-paper-400 dark:text-paper"
                    />
                  </LiveField>

                  <LiveField icon={Clock} label="Início">
                    <input
                      type="datetime-local"
                      value={start}
                      onChange={(e) => setStart(e.target.value)}
                      className="w-full border-none bg-transparent text-[15px] text-ink outline-none dark:text-paper [color-scheme:light] dark:[color-scheme:dark]"
                    />
                  </LiveField>

                  {/* Duração — chips animados em vez de input numérico cru */}
                  <div>
                    <p className="mb-2 flex items-center gap-1.5 text-[13px] font-medium text-ink dark:text-paper">
                      <Clock className="size-3.5 text-paper-400" /> Duração
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {DURATION_PRESETS.map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setDurationMin(m)}
                          className={cx(
                            "relative rounded-full px-3.5 py-1.5 text-sm font-semibold transition-all",
                            durationMin === m
                              ? "bg-brand-600 text-white shadow-brand-glow"
                              : "bg-paper-100 text-paper-500 hover:bg-paper-200 dark:bg-ink-800 dark:hover:bg-ink-700",
                          )}
                        >
                          {m < 60 ? `${m} min` : `${m / 60}h`}
                        </button>
                      ))}
                      <input
                        type="number"
                        min={5}
                        step={5}
                        value={durationMin}
                        onChange={(e) => setDurationMin(Number(e.target.value))}
                        className="w-20 rounded-full border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-900 px-3 py-1.5 text-center text-sm font-medium text-ink dark:text-paper focus-ring"
                      />
                    </div>
                  </div>

                  {/* Recorrência — mesma linguagem de chip pill da duração. */}
                  <div>
                    <p className="mb-2 flex items-center gap-1.5 text-[13px] font-medium text-ink dark:text-paper">
                      <Repeat className="size-3.5 text-paper-400" /> Repetir
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      {RECURRENCE_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setRecurrenceFreq(opt.value)}
                          className={cx(
                            "rounded-full px-3.5 py-1.5 text-sm font-semibold transition-all",
                            recurrenceFreq === opt.value
                              ? "bg-brand-600 text-white shadow-brand-glow"
                              : "bg-paper-100 text-paper-500 hover:bg-paper-200 dark:bg-ink-800 dark:hover:bg-ink-700",
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                      {recurrenceFreq !== "none" && (
                        <span className="flex items-center gap-1.5 text-xs text-paper-400">
                          por
                          <input
                            type="number"
                            min={2}
                            max={52}
                            value={recurrenceCount}
                            onChange={(e) => setRecurrenceCount(Number(e.target.value))}
                            className="w-14 rounded-full border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-900 px-2 py-1 text-center text-sm font-medium text-ink dark:text-paper focus-ring"
                          />
                          ocorrências
                        </span>
                      )}
                    </div>
                  </div>

                  <LiveField icon={Users} label="Participantes" hint="Emails separados por vírgula">
                    <input
                      value={attendees}
                      onChange={(e) => setAttendees(e.target.value)}
                      placeholder="ana@empresa.com, bruno@empresa.com"
                      className="w-full border-none bg-transparent text-[15px] text-ink outline-none placeholder-paper-400 dark:text-paper"
                    />
                  </LiveField>

                  {/* Preview animado dos convidados conforme digita */}
                  <AnimatePresence>
                    {attendeeList.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="flex flex-wrap gap-1.5 overflow-hidden"
                      >
                        {attendeeList.map((email) => (
                          <span
                            key={email}
                            className="flex items-center gap-1.5 rounded-full bg-brand-500/10 py-1 pl-1 pr-2.5 text-xs font-medium text-brand-700 dark:text-brand-300"
                          >
                            <span
                              className={cx(
                                "grid size-5 place-items-center rounded-full bg-gradient-to-br text-[8px] font-bold text-white",
                                gradientFor(email),
                              )}
                            >
                              {email.slice(0, 2).toUpperCase()}
                            </span>
                            {email}
                          </span>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <LiveField icon={Mail} label="Descrição" hint="Opcional">
                    <textarea
                      rows={2}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Pauta, contexto, links úteis…"
                      className="w-full resize-none border-none bg-transparent text-sm text-ink outline-none placeholder-paper-400 dark:text-paper"
                    />
                  </LiveField>

                  <AnimatePresence>
                    {error && (
                      <motion.p
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="flex items-center gap-2 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger"
                      >
                        <AlertCircle className="size-4 shrink-0" /> {error}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-paper-100 dark:border-ink-800 px-6 py-4">
                  <Button variant="ghost" className="!rounded-full" onClick={handleClose}>
                    Cancelar
                  </Button>
                  <Button
                    icon={<Video className="size-4" />}
                    loading={create.isPending}
                    disabled={!canSubmit}
                    onClick={handleSubmit}
                    className="!rounded-full"
                  >
                    Criar reunião
                  </Button>
                </div>
              </>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

// Campo "vivo": borda só aparece com foco (:focus-within), ícone acompanha a cor.
export function LiveField({
  icon: Icon,
  label,
  hint,
  children,
}: {
  icon: typeof Type
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between text-[13px] font-medium text-ink dark:text-paper">
        {label}
        {hint && <span className="text-xs font-normal text-paper-400">{hint}</span>}
      </span>
      <div className="group flex items-center gap-2.5 rounded-xl border border-paper-200 dark:border-ink-700 bg-paper-50 dark:bg-ink-800/60 px-3.5 py-2.5 transition-colors focus-within:border-brand-400 focus-within:bg-paper dark:focus-within:bg-ink-800">
        <Icon className="size-4 shrink-0 text-paper-400 transition-colors group-focus-within:text-brand-500" />
        {children}
      </div>
    </label>
  )
}

function SuccessState({ meetLink, onClose }: { meetLink: string; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center px-6 py-10 text-center"
    >
      <motion.div
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.05 }}
        className="grid size-16 place-items-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 shadow-lg"
      >
        <Check className="size-8 text-white" strokeWidth={3} />
      </motion.div>
      <motion.h3
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="mt-4 text-lg font-bold text-ink dark:text-paper"
      >
        Reunião criada!
      </motion.h3>
      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="mt-1 text-sm text-paper-500"
      >
        Convites enviados aos participantes.
      </motion.p>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.28 }}
        className="mt-6 flex w-full flex-col gap-2"
      >
        <a
          href={meetLink}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
        >
          <Video className="size-4" /> Entrar na call
        </a>
        <Button variant="ghost" onClick={onClose}>
          Fechar
        </Button>
      </motion.div>
    </motion.div>
  )
}
