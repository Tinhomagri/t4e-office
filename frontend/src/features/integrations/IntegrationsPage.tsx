import { CalendarClock, CalendarPlus, ExternalLink, Video } from "lucide-react"
import { useEffect, useState } from "react"
import { useSearchParams } from "react-router-dom"

import { extractApiError } from "@/shared/api/client"
import {
  Badge,
  Button,
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reuniões"
        subtitle="Conecte o Google e agende calls com Meet direto da sua agenda"
      />

      {banner && (
        <div className="rounded-xl border border-ink/10 bg-paper-50 dark:bg-ink-900 px-4 py-3 text-sm text-ink dark:text-paper">
          {banner}
        </div>
      )}

      {/* Cartão de conexão Google */}
      <section className="rounded-2xl border border-ink/10 bg-paper dark:bg-ink-900 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
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
          <div className="flex gap-2">
            {connected ? (
              <Button
                variant="ghost"
                loading={disconnect.isPending}
                onClick={() => disconnect.mutate()}
              >
                Desconectar
              </Button>
            ) : (
              <Button
                loading={connect.isPending}
                onClick={() => connect.mutate()}
              >
                Conectar Google
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* Próximas reuniões */}
      {connected && (
        <section className="rounded-2xl border border-ink/10 bg-paper dark:bg-ink-900 p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-ink dark:text-paper">
              <CalendarClock className="size-4" /> Próximos eventos
            </h3>
            <Button
              size="sm"
              icon={<CalendarPlus className="size-4" />}
              onClick={() => setScheduleOpen(true)}
            >
              Agendar reunião
            </Button>
          </div>

          {events.isLoading ? (
            <div className="flex justify-center py-6">
              <Spinner className="size-5" />
            </div>
          ) : events.isError ? (
            <p className="py-4 text-sm text-danger">{extractApiError(events.error)}</p>
          ) : (events.data ?? []).length === 0 ? (
            <p className="py-4 text-sm text-paper-500">Nenhum evento próximo.</p>
          ) : (
            <ul className="divide-y divide-ink/5">
              {(events.data ?? []).map((e) => (
                <li
                  key={e.event_id}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-ink dark:text-paper">{e.title}</p>
                    <p className="text-xs text-paper-500">{formatRange(e.start, e.end)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {e.meet_link && (
                      <a
                        href={e.meet_link}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 hover:bg-brand-100"
                      >
                        <Video className="size-3.5" /> Entrar
                      </a>
                    )}
                    <a
                      href={e.html_link}
                      target="_blank"
                      rel="noreferrer"
                      className="text-paper-400 hover:text-ink dark:hover:text-paper"
                      title="Abrir no Google Agenda"
                    >
                      <ExternalLink className="size-4" />
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <ScheduleMeetingModal open={scheduleOpen} onClose={() => setScheduleOpen(false)} />
    </div>
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

function formatRange(startIso: string, endIso: string): string {
  const start = new Date(startIso)
  const end = new Date(endIso)
  const date = start.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  })
  const t = (d: Date) =>
    d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  return `${date} · ${t(start)}–${t(end)}`
}
