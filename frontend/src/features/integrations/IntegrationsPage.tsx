import {
  CalendarClock,
  CalendarPlus,
  CalendarX2,
  ExternalLink,
  Link2,
  Sparkles,
  Unplug,
  Video,
} from "lucide-react"
import { useEffect, useState } from "react"
import { useSearchParams } from "react-router-dom"

import { extractApiError } from "@/shared/api/client"
import {
  Badge,
  Button,
  cx,
  Field,
  Input,
  Modal,
  PageHeader,
  Spinner,
  Textarea,
} from "@/shared/ui/primitives"
import {
  useConnectGoogle,
  useCreateMeeting,
  useDisconnectGoogle,
  useGoogleStatus,
  useUpcomingEvents,
} from "./integrations.hooks"

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
function gradientFor(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) & 0xffff
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length]
}
function AttendeeAvatar({ email, size = "sm" }: { email: string; size?: "xs" | "sm" }) {
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

function dayLabel(iso: string, allDay?: boolean): string {
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
          <Button icon={<CalendarPlus className="size-4" />} onClick={() => setScheduleOpen(true)}>
            Agendar reunião
          </Button>
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
              >
                Desconectar
              </Button>
            ) : (
              <Button loading={connect.isPending} onClick={() => connect.mutate()}>
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
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
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

      {/* A agenda em si — o Google Calendar de verdade, embutido */}
      {connected && status.data?.google_email && (
        <EmbeddedGoogleCalendar email={status.data.google_email} />
      )}

      <ScheduleMeetingModal open={scheduleOpen} onClose={() => setScheduleOpen(false)} />
    </div>
  )
}

// Embed real do Google Calendar (iframe oficial do Google). Só renderiza
// eventos se a agenda estiver marcada como pública/compartilhada nas
// configurações do Google — não há como contornar isso via iframe, então
// deixamos o passo a passo sempre visível (colapsado) logo abaixo.
function EmbeddedGoogleCalendar({ email }: { email: string }) {
  const [showHelp, setShowHelp] = useState(false)
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const src = `https://calendar.google.com/calendar/embed?src=${encodeURIComponent(email)}&ctz=${encodeURIComponent(tz)}&mode=WEEK&showTitle=0&showPrint=0&showTabs=0&showCalendars=0`

  return (
    <section className="overflow-hidden rounded-2xl border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-900 shadow-card">
      <div className="flex items-center justify-between gap-3 border-b border-paper-100 dark:border-ink-800 px-5 py-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-ink dark:text-paper">
          <CalendarClock className="size-4" /> Sua agenda do Google
        </h3>
        <button
          onClick={() => setShowHelp((v) => !v)}
          className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
        >
          {showHelp ? "Ocultar" : "Não está vendo sua agenda aqui?"}
        </button>
      </div>

      {showHelp && (
        <div className="space-y-2 border-b border-paper-100 dark:border-ink-800 bg-paper-50 dark:bg-ink-800/60 px-5 py-4 text-sm text-paper-600 dark:text-paper-400">
          <p>
            O Google só permite mostrar uma agenda dentro de outro site (como o Pulse) se ela estiver
            configurada como pública. Pra habilitar:
          </p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Abra as configurações da sua agenda no Google Calendar.</li>
            <li>Em "Acesso de compartilhamento", marque "Disponibilizar publicamente".</li>
            <li>Marque "Ver todos os detalhes do evento" e salve.</li>
          </ol>
          <a
            href="https://calendar.google.com/calendar/r/settings"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-medium text-brand-600 hover:underline dark:text-brand-400"
          >
            Abrir configurações do Google Calendar <ExternalLink className="size-3.5" />
          </a>
          <p className="text-xs text-paper-400">
            Isso torna a agenda visível publicamente na web para quem tiver o link — se preferir não
            expor, você pode continuar usando a lista de próximos eventos e o botão "Agendar reunião" normalmente.
          </p>
        </div>
      )}

      <iframe
        title="Google Calendar"
        src={src}
        className="h-[640px] w-full border-0"
        loading="lazy"
      />
    </section>
  )
}

function ScheduleMeetingModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateMeeting()
  const [title, setTitle] = useState("")
  const [start, setStart] = useState("")
  const [durationMin, setDurationMin] = useState(30)
  const [attendees, setAttendees] = useState("")
  const [description, setDescription] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const reset = () => {
    setTitle("")
    setStart("")
    setDurationMin(30)
    setAttendees("")
    setDescription("")
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
        attendees: attendees
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        description,
      })
      setDone(result.meet_link ?? result.html_link)
    } catch (e) {
      setError(extractApiError(e))
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Agendar reunião"
      description="Cria o evento na sua agenda com link do Google Meet e convites."
      footer={
        done ? (
          <Button onClick={handleClose}>Fechar</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={handleClose}>
              Cancelar
            </Button>
            <Button
              loading={create.isPending}
              disabled={!title || !start}
              onClick={handleSubmit}
            >
              Criar reunião
            </Button>
          </>
        )
      }
    >
      {done ? (
        <div className="space-y-3 py-2 text-sm text-ink dark:text-paper">
          <p>Reunião criada! Convites enviados aos participantes.</p>
          <a
            href={done}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-3 py-2 font-medium text-brand-700 hover:bg-brand-100"
          >
            <Video className="size-4" /> Abrir reunião
          </a>
        </div>
      ) : (
        <div className="space-y-3">
          <Field label="Título">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Review do sprint"
            />
          </Field>
          <div className="flex gap-3">
            <Field label="Início">
              <Input
                type="datetime-local"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </Field>
            <Field label="Duração (min)">
              <Input
                type="number"
                min={15}
                step={15}
                value={durationMin}
                onChange={(e) => setDurationMin(Number(e.target.value))}
              />
            </Field>
          </div>
          <Field label="Participantes" hint="Emails separados por vírgula">
            <Input
              value={attendees}
              onChange={(e) => setAttendees(e.target.value)}
              placeholder="ana@empresa.com, bruno@empresa.com"
            />
          </Field>
          <Field label="Descrição (opcional)">
            <Textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      )}
    </Modal>
  )
}
