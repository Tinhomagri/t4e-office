import {
  ParticipantTile,
  RoomAudioRenderer,
  useDisconnectButton,
  useTrackToggle,
  useTracks,
} from "@livekit/components-react"
import "@livekit/components-styles"
import { ROOM_OPTIONS } from "./roomOptions"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Track } from "livekit-client"
import { AnimatePresence, motion } from "framer-motion"
import {
  BarChart3,
  Clock,
  Loader2,
  LogIn,
  Mic,
  MicOff,
  Phone,
  Plus,
  ScreenShare,
  TrendingUp,
  Trash2,
  Users,
  Video,
  VideoOff,
  X,
} from "lucide-react"
import { lazy, Suspense, useState } from "react"

import { useWorkspaces } from "@/features/workspace/workspace.hooks"
import { extractApiError } from "@/shared/api/client"
import { Button, Input, Spinner, cx } from "@/shared/ui/primitives"
import * as meetApi from "./meetings.api"
import type { JoinResult } from "./meetings.api"

// O SDK do LiveKit puxa o engine WebRTC inteiro. Carregar sob demanda mantém o
// bundle inicial do app fora do caminho de quem nunca abre uma reunião.
const LiveKitRoom = lazy(() =>
  import("@livekit/components-react").then((m) => ({ default: m.LiveKitRoom })),
)

export function MeetingsPage() {
  const { activeWorkspaceId } = useWorkspaces()
  const qc = useQueryClient()
  const [session, setSession] = useState<JoinResult | null>(null)
  const [name, setName] = useState("")
  const [tab, setTab] = useState<"open" | "history">("open")
  // Encerrar é irreversível: guarda o id da sala aguardando confirmação em vez
  // de fechar no primeiro clique.
  const [confirmClose, setConfirmClose] = useState<string | null>(null)
  const [reportOpen, setReportOpen] = useState(false)

  const { data: rooms, isLoading } = useQuery({
    queryKey: ["meeting-rooms", activeWorkspaceId, tab],
    queryFn: () => meetApi.listRooms(activeWorkspaceId!, tab === "history"),
    enabled: !!activeWorkspaceId,
    // Sala nova de um colega precisa aparecer sem F5; o custo é uma query leve.
    refetchInterval: 15_000,
  })

  const create = useMutation({
    mutationFn: () =>
      meetApi.createRoom({ workspaceId: activeWorkspaceId!, name: name.trim() }),
    onSuccess: async (room) => {
      setName("")
      qc.invalidateQueries({ queryKey: ["meeting-rooms", activeWorkspaceId] })
      // Quem cria a sala quer entrar nela — não faz sentido criar e ficar olhando.
      setSession(await meetApi.joinRoom(room.id))
    },
  })

  const closeRoom = useMutation({
    mutationFn: (roomId: string) => meetApi.closeRoom(roomId),
    onSuccess: () => {
      setConfirmClose(null)
      qc.invalidateQueries({ queryKey: ["meeting-rooms", activeWorkspaceId] })
    },
  })

  const join = useMutation({
    mutationFn: (roomId: string) => meetApi.joinRoom(roomId),
    onSuccess: (result) => setSession(result),
  })

  const leave = async () => {
    if (session) await meetApi.leaveRoom(session.room.id).catch(() => {})
    setSession(null)
    qc.invalidateQueries({ queryKey: ["meeting-rooms", activeWorkspaceId] })
  }

  if (!activeWorkspaceId) return null

  return (
    <div className="space-y-5 pb-8">
      {/* Faixa de ação: criar sala é a tarefa primária desta tela, então ela
          ocupa o topo inteiro em vez de ficar num input solto. O gradiente é
          sutil e usa os tokens da marca — não é decoração vazia, é o que
          separa a zona de ação da lista de salas. */}
      <div className="relative overflow-hidden rounded-2xl border border-paper-200 bg-gradient-to-br from-brand-50 via-paper to-paper p-5 dark:border-ink-700 dark:from-brand-500/10 dark:via-ink-900 dark:to-ink-900">
        <div className="absolute -right-8 -top-8 size-40 rounded-full bg-brand-400/10 blur-3xl" />
        <div className="relative flex flex-wrap items-end gap-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-violet-600 text-white shadow-brand-glow">
            <Video className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold tracking-tight text-ink dark:text-ink-200">
              Reuniões
            </h1>
            <p className="mt-0.5 text-[13px] text-paper-500 dark:text-ink-400">
              Sala de vídeo do time, sem sair do T4E Office
            </p>
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <button
              onClick={() => setReportOpen((v) => !v)}
              className={cx(
                "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-[13px] font-medium transition-colors",
                reportOpen
                  ? "border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-500/40 dark:bg-brand-500/10 dark:text-brand-300"
                  : "border-paper-200 dark:border-ink-700 text-paper-500 hover:bg-paper-100 dark:hover:bg-ink-800 hover:text-ink dark:hover:text-ink-200",
              )}
            >
              <BarChart3 className="size-4" /> Relatório
            </button>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && name.trim() && create.mutate()}
              placeholder="Nome da sala"
              className="w-full sm:w-56"
            />
            <Button
              onClick={() => create.mutate()}
              loading={create.isPending}
              disabled={!name.trim()}
              icon={<Plus className="size-4" />}
            >
              Criar sala
            </Button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {reportOpen && <MeetingReportPanel workspaceId={activeWorkspaceId} />}
      </AnimatePresence>

      <div className="flex gap-1 border-b border-paper-200 dark:border-ink-700">
        {([["open", "Salas abertas"], ["history", "Histórico"]] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cx(
              "-mb-px border-b-2 px-3 py-2 text-[13px] font-medium transition-colors",
              tab === id
                ? "border-brand-500 text-ink dark:text-ink-200"
                : "border-transparent text-paper-500 hover:text-ink dark:hover:text-ink-200",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            // Esqueleto no formato do card: um spinner solto faz a lista
            // "pular" quando os dados chegam.
            <div
              key={i}
              className="h-[104px] animate-pulse rounded-2xl border border-paper-200 bg-paper-50 dark:border-ink-700 dark:bg-ink-800/40"
            />
          ))}
        </div>
      ) : (rooms ?? []).length === 0 ? (
        <div className="rounded-2xl border border-dashed border-paper-200 py-16 text-center dark:border-ink-700">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-paper-100 text-paper-400 dark:bg-ink-800">
            <VideoOff className="size-5" />
          </span>
          <p className="mt-3 text-sm font-medium text-ink dark:text-ink-200">
            Nenhuma sala aberta
          </p>
          <p className="mx-auto mt-1 max-w-xs text-[13px] text-paper-500">
            Dê um nome acima e crie a primeira — quem entrar depois cai na mesma sala.
          </p>
        </div>
      ) : tab === "history" ? (
        <div className="space-y-2">
          {(rooms ?? []).map((room) => (
            <div
              key={room.id}
              className="rounded-xl border border-paper-200 bg-paper p-4 dark:border-ink-700 dark:bg-ink-800/40"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-paper-100 text-paper-400 dark:bg-ink-700">
                  <Video className="size-4" />
                </span>
                <p className="text-sm font-semibold text-ink dark:text-ink-200">{room.name}</p>
                <span className="text-[11px] text-paper-400">
                  {fmtDate(room.closed_at ?? room.created_at)}
                </span>
                <span className="ml-auto flex items-center gap-3 text-[11px] text-paper-500">
                  <span className="flex items-center gap-1">
                    <Clock className="size-3" />
                    {room.duration_minutes} min
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="size-3" />
                    {room.history.length}
                  </span>
                </span>
              </div>
              {room.history.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5 border-t border-paper-100 pt-3 dark:border-ink-700">
                  {room.history.map((p) => (
                    <span
                      key={p.user_id}
                      className="flex items-center gap-1.5 rounded-full bg-paper-100 py-0.5 pl-0.5 pr-2 text-[11px] dark:bg-ink-700"
                    >
                      <span className="grid size-5 place-items-center rounded-full bg-brand-500/20 text-[8px] font-semibold text-brand-600 dark:text-brand-300">
                        {p.name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("")}
                      </span>
                      <span className="text-ink dark:text-ink-200">{p.name.split(" ")[0]}</span>
                      <span className="tabular text-paper-400">{p.minutes}min</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {(rooms ?? []).map((room) => {
            const live = room.participants > 0
            return (
              <div
                key={room.id}
                className={cx(
                  "group relative overflow-hidden rounded-2xl border p-4 transition-all",
                  // Sala com gente é o alvo do olho: ganha borda de marca e
                  // leve elevação. Sala vazia fica neutra.
                  live
                    ? "border-brand-300 bg-brand-50/40 hover:-translate-y-0.5 hover:shadow-panel dark:border-brand-500/40 dark:bg-brand-500/5"
                    : "border-paper-200 bg-paper hover:-translate-y-0.5 hover:border-paper-300 hover:shadow-card dark:border-ink-700 dark:bg-ink-800/40 dark:hover:border-ink-600",
                )}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={cx(
                      "grid size-10 shrink-0 place-items-center rounded-xl",
                      live
                        ? "bg-gradient-to-br from-brand-500 to-violet-600 text-white"
                        : "bg-paper-100 text-paper-400 dark:bg-ink-700 dark:text-ink-400",
                    )}
                  >
                    <Video className="size-[18px]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink dark:text-ink-200">
                      {room.name}
                    </p>
                    {live ? (
                      <span className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-medium text-brand-600 dark:text-brand-300">
                        {/* Ponto pulsante: o estado "tem gente agora" muda
                            sozinho, e movimento é o que comunica isso. */}
                        <span className="relative flex size-1.5">
                          <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-400 opacity-75" />
                          <span className="relative inline-flex size-1.5 rounded-full bg-brand-500" />
                        </span>
                        {room.participants} na sala
                      </span>
                    ) : (
                      <span className="mt-1 inline-flex items-center gap-1.5 text-[11px] text-paper-400">
                        <Users className="size-3" />
                        Vazia
                      </span>
                    )}
                  </div>
                </div>

                {/* Encerrar aparece no hover: ação destrutiva não deve
                    competir com "Entrar", que é o que se faz 99% das vezes. */}
                {confirmClose === room.id ? (
                  <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-danger/10 p-1.5">
                    <span className="flex-1 pl-1 text-[11px] text-danger">Encerrar sala?</span>
                    <button
                      onClick={() => closeRoom.mutate(room.id)}
                      className="rounded px-2 py-1 text-[11px] font-semibold text-danger hover:bg-danger/10"
                    >
                      Encerrar
                    </button>
                    <button
                      onClick={() => setConfirmClose(null)}
                      className="rounded px-2 py-1 text-[11px] text-paper-500 hover:bg-paper-100 dark:hover:bg-ink-700"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : null}
                <button
                  onClick={() => setConfirmClose(room.id)}
                  title="Encerrar sala"
                  className="absolute right-2 top-2 rounded-lg p-1.5 text-paper-400 opacity-0 transition-all hover:bg-danger/10 hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <Trash2 className="size-3.5" />
                </button>
                <Button
                  size="sm"
                  variant={live ? "primary" : "outline"}
                  className="mt-3 w-full"
                  onClick={() => join.mutate(room.id)}
                  loading={join.isPending && join.variables === room.id}
                  icon={<LogIn className="size-3.5" />}
                >
                  {live ? "Entrar agora" : "Entrar"}
                </Button>
              </div>
            )
          })}
        </div>
      )}

      <AnimatePresence>
        {session && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col bg-ink-950"
          >
            <div className="flex items-center justify-between gap-3 border-b border-ink-700 px-4 py-2.5">
              <p className="truncate text-sm font-semibold text-paper-200">
                {session.room.name}
              </p>
              <button
                onClick={leave}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-paper-400 transition-colors hover:bg-ink-800 hover:text-paper-200"
              >
                <X className="size-4" /> Sair
              </button>
            </div>
            <Suspense
              fallback={
                <div className="grid flex-1 place-items-center">
                  <Loader2 className="size-6 animate-spin text-paper-400" />
                </div>
              }
            >
              <LiveKitRoom
                token={session.token}
                serverUrl={session.url}
                connect
                video
                audio
                options={ROOM_OPTIONS}
                onDisconnected={leave}
                data-lk-theme="default"
                className="flex min-h-0 flex-1 flex-col"
              >
                <VideoStage />
                <RoomAudioRenderer />
                <MeetControlBar />
              </LiveKitRoom>
            </Suspense>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** Grade de vídeo: câmeras + quem está compartilhando tela. */
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  })
}

function formatMinutes(min: number): string {
  if (min < 60) return `${min}min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `${h}h${m}min` : `${h}h`
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function initialsOf(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?"
}

const REPORT_DAYS = 30

/** Quantas reuniões, quanto tempo e com quem — mesmo formato do relatório de
 * participação da Agenda (Google Meet), pro usuário não reaprender a ler. */
function MeetingReportPanel({ workspaceId }: { workspaceId: string | null }) {
  const report = useQuery({
    queryKey: ["meeting-report", workspaceId, REPORT_DAYS],
    queryFn: () => meetApi.getMeetingReport(workspaceId!, REPORT_DAYS),
    enabled: !!workspaceId,
  })

  return (
    <motion.section
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden rounded-2xl border border-paper-200 dark:border-ink-700 bg-paper dark:bg-ink-900 shadow-card"
    >
      <div className="flex items-center gap-2 border-b border-paper-100 dark:border-ink-800 px-5 py-3">
        <BarChart3 className="size-4 text-brand-500" />
        <h3 className="text-sm font-semibold text-ink dark:text-ink-200">Suas reuniões</h3>
        <span className="text-xs text-paper-400">· últimos {REPORT_DAYS} dias</span>
      </div>

      {report.isLoading && (
        <div className="flex justify-center py-10">
          <Spinner className="size-5" />
        </div>
      )}

      {report.isError && (
        <p className="px-5 py-4 text-sm text-danger">{extractApiError(report.error)}</p>
      )}

      {report.data && (
        <div className="p-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MetricTile icon={Video} label="Reuniões" value={String(report.data.total_meetings)} />
            <MetricTile icon={Clock} label="Tempo total" value={formatMinutes(report.data.total_minutes)} />
            <MetricTile
              icon={TrendingUp}
              label="Média por call"
              value={formatMinutes(Math.round(report.data.average_minutes))}
            />
            <MetricTile
              icon={BarChart3}
              label="Dia mais cheio"
              value={report.data.busiest_weekday ? capitalize(report.data.busiest_weekday) : "—"}
            />
          </div>

          {report.data.top_collaborators.length > 0 && (
            <div className="mt-6">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-paper-400">
                Com quem você mais se reúne
              </p>
              <div className="space-y-2.5">
                {report.data.top_collaborators.map((c) => {
                  const max = report.data!.top_collaborators[0].minutes || 1
                  const pct = Math.max(6, Math.round((c.minutes / max) * 100))
                  return (
                    <div key={c.user_id} className="flex items-center gap-3">
                      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-500/20 text-[9px] font-semibold text-brand-600 dark:text-brand-300">
                        {initialsOf(c.name)}
                      </span>
                      <span className="w-36 shrink-0 truncate text-sm text-ink dark:text-ink-200">
                        {c.name}
                      </span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-paper-100 dark:bg-ink-800">
                        <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-28 shrink-0 text-right text-xs text-paper-400">
                        {c.meetings} sala{c.meetings !== 1 ? "s" : ""} · {formatMinutes(c.minutes)}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {report.data.total_meetings === 0 && (
            <p className="mt-4 text-sm text-paper-400">
              Nenhuma reunião nos últimos {REPORT_DAYS} dias.
            </p>
          )}
        </div>
      )}
    </motion.section>
  )
}

function MetricTile({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Video
  label: string
  value: string
}) {
  return (
    <div className="rounded-2xl bg-paper-50 dark:bg-ink-800/60 px-4 py-3.5">
      <Icon className="size-4 text-paper-400" />
      <p className="mt-2 text-xl font-bold text-ink dark:text-ink-200">{value}</p>
      <p className="text-xs text-paper-400">{label}</p>
    </div>
  )
}

// Barra de controle estilo Meet: botões redondos só com ícone (sem o texto em
// inglês "Microphone/Camera/Share screen/Leave" do ControlBar padrão da lib).
function CallButton({
  variant = "default",
  onClick,
  label,
  children,
}: {
  /** off = mic/câmera desligados (vermelho); sharing = tela sendo
   * compartilhada agora (azul da marca); danger = encerrar chamada. */
  variant?: "default" | "off" | "sharing" | "danger"
  onClick: React.MouseEventHandler<HTMLButtonElement>
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cx(
        "grid size-12 place-items-center rounded-full transition-colors",
        variant === "danger" || variant === "off"
          ? "bg-red-600 text-white hover:bg-red-500"
          : variant === "sharing"
            ? "bg-brand-600 text-white hover:bg-brand-500"
            : "bg-white/10 text-white hover:bg-white/20",
      )}
    >
      {children}
    </button>
  )
}

function MeetControlBar() {
  const mic = useTrackToggle({ source: Track.Source.Microphone })
  const camera = useTrackToggle({ source: Track.Source.Camera })
  const screenShare = useTrackToggle({ source: Track.Source.ScreenShare })
  const { buttonProps: disconnectProps } = useDisconnectButton({})

  return (
    <div className="flex items-center justify-center gap-3 bg-ink-950 py-4">
      <CallButton
        variant={mic.enabled ? "default" : "off"}
        onClick={mic.buttonProps.onClick as React.MouseEventHandler<HTMLButtonElement>}
        label={mic.enabled ? "Desativar microfone" : "Ativar microfone"}
      >
        {mic.enabled ? <Mic className="size-5" /> : <MicOff className="size-5" />}
      </CallButton>
      <CallButton
        variant={camera.enabled ? "default" : "off"}
        onClick={camera.buttonProps.onClick as React.MouseEventHandler<HTMLButtonElement>}
        label={camera.enabled ? "Desativar câmera" : "Ativar câmera"}
      >
        {camera.enabled ? <Video className="size-5" /> : <VideoOff className="size-5" />}
      </CallButton>
      <CallButton
        variant={screenShare.enabled ? "sharing" : "default"}
        onClick={screenShare.buttonProps.onClick as React.MouseEventHandler<HTMLButtonElement>}
        label={screenShare.enabled ? "Parar compartilhamento" : "Compartilhar tela"}
      >
        <ScreenShare className="size-5" />
      </CallButton>
      <CallButton
        variant="danger"
        onClick={disconnectProps.onClick as React.MouseEventHandler<HTMLButtonElement>}
        label="Sair da chamada"
      >
        <Phone className="size-5 rotate-[135deg]" />
      </CallButton>
    </div>
  )
}

function VideoStage() {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      // Sem placeholder: uma tela não compartilhada não deve ocupar um quadro
      // vazio na grade.
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  )

  // Estilo Meet: quadros do mesmo tamanho preenchendo o espaço, sem sobrar
  // célula vazia quando a contagem não é um quadrado perfeito (3, 5, 6, 7...).
  // O `GridLayout` da lib é uma grade fixa NxN — com 3 pessoas ele monta 2x2
  // e a 4ª célula fica preta. Aqui é flex-wrap com todo quadro do mesmo
  // tamanho: a última linha incompleta centraliza (`justify-content: center`)
  // em vez de deixar vão à direita.
  const count = tracks.length || 1
  const columns = Math.max(1, Math.ceil(Math.sqrt(count)))
  const rows = Math.max(1, Math.ceil(count / columns))

  return (
    <div className="meet-video-stage flex min-h-0 flex-1 flex-wrap content-center justify-center gap-2 overflow-hidden bg-ink-950 p-2">
      {tracks.map((track, i) => (
        <ParticipantTile
          key={`${track.participant.identity}-${track.source}-${i}`}
          trackRef={track}
          style={{
            width: `calc(${100 / columns}% - 0.5rem)`,
            height: `calc(${100 / rows}% - 0.5rem)`,
          }}
        />
      ))}
    </div>
  )
}
