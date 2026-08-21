import {
  ParticipantTile,
  RoomAudioRenderer,
  useRoomContext,
  useParticipants,
  useDisconnectButton,
  useMediaDeviceSelect,
  useTrackToggle,
  useTracks,
} from "@livekit/components-react"
import type { TrackReferenceOrPlaceholder } from "@livekit/components-core"
import "@livekit/components-styles"
import { ROOM_OPTIONS } from "./roomOptions"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Track } from "livekit-client"
import { AnimatePresence, motion } from "framer-motion"
import { createPortal } from "react-dom"
import { useLocation } from "react-router-dom"
import {
  BarChart3,
  Check,
  ChevronUp,
  Clock,
  Loader2,
  LogIn,
  LogOut,
  Mic,
  MicOff,
  Phone,
  Plus,
  ScreenShare,
  TrendingUp,
  Trash2,
  Users,
  MessageCircle,
  Maximize2,
  Minimize2,
  PictureInPicture2,
  Send,
  Video,
  VideoOff,
  X,
} from "lucide-react"
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react"

import { useAuthStore } from "@/features/auth/auth.store"
import { useMembers, useWorkspaces } from "@/features/workspace/workspace.hooks"
import { extractApiError } from "@/shared/api/client"
import { Button, Input, Spinner, cx } from "@/shared/ui/primitives"
import * as meetApi from "./meetings.api"
import { useMeetingSessionStore } from "./meeting.session.store"

// O SDK do LiveKit puxa o engine WebRTC inteiro. Carregar sob demanda mantém o
// bundle inicial do app fora do caminho de quem nunca abre uma reunião.
const LiveKitRoom = lazy(() =>
  import("@livekit/components-react").then((m) => ({ default: m.LiveKitRoom })),
)

export function MeetingsPage() {
  const { activeWorkspaceId } = useWorkspaces()
  const qc = useQueryClient()
  const me = useAuthStore((s) => s.user)
  const { data: members } = useMembers(activeWorkspaceId)
  const myRole = (members ?? []).find((m) => m.user_id === me?.id)?.role ?? null
  const isAdmin = myRole === "owner" || myRole === "admin"
  const setSession = useMeetingSessionStore((s) => s.setSession)
  const [name, setName] = useState("")
  const [tab, setTab] = useState<"open" | "history">("open")
  // Encerrar é irreversível: guarda o id da sala aguardando confirmação em vez
  // de fechar no primeiro clique.
  const [confirmClose, setConfirmClose] = useState<string | null>(null)
  // Idem, mas pra "tirar todo mundo da chamada" — ação separada de encerrar
  // a sala (essa aqui não apaga a sala fixa, só derruba quem tá ao vivo).
  const [confirmEndCall, setConfirmEndCall] = useState<string | null>(null)
  const [reportOpen, setReportOpen] = useState(false)

  const { data: rooms, isLoading } = useQuery({
    queryKey: ["meeting-rooms", activeWorkspaceId, tab],
    queryFn: () => meetApi.listRooms(activeWorkspaceId!, tab === "history"),
    enabled: !!activeWorkspaceId,
    // Sala nova de um colega precisa aparecer sem F5; o custo é uma query leve.
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
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

  const endCallForEveryone = useMutation({
    mutationFn: (roomId: string) => meetApi.endCallForEveryone(roomId),
    onSuccess: () => setConfirmEndCall(null),
  })

  const join = useMutation({
    mutationFn: (roomId: string) => meetApi.joinRoom(roomId),
    onSuccess: (result) => setSession(result),
  })

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
              onClick={() => {
                create.mutate()
              }}
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
                {/* Sala fixa (daily, recorrente) tem gente ao vivo há tempo
                    demais e ninguém sabe encerrar — admin tira todo mundo
                    sem apagar a sala (amanhã ela continua lá). */}
                {confirmEndCall === room.id ? (
                  <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-danger/10 p-1.5">
                    <span className="flex-1 pl-1 text-[11px] text-danger">
                      Encerrar a chamada pra todo mundo?
                    </span>
                    <button
                      onClick={() => endCallForEveryone.mutate(room.id)}
                      className="rounded px-2 py-1 text-[11px] font-semibold text-danger hover:bg-danger/10"
                    >
                      Encerrar
                    </button>
                    <button
                      onClick={() => setConfirmEndCall(null)}
                      className="rounded px-2 py-1 text-[11px] text-paper-500 hover:bg-paper-100 dark:hover:bg-ink-700"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : null}
                {live && isAdmin && (
                  <button
                    onClick={() => setConfirmEndCall(room.id)}
                    title="Encerrar chamada para todos"
                    className="absolute right-9 top-2 rounded-lg p-1.5 text-paper-400 opacity-0 transition-all hover:bg-danger/10 hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <LogOut className="size-3.5" />
                  </button>
                )}
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
                  onClick={() => {
                    join.mutate(room.id)
                  }}
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

    </div>
  )
}

export function MeetingCallOverlay() {
  const session = useMeetingSessionStore((s) => s.session)
  const setSession = useMeetingSessionStore((s) => s.setSession)
  const location = useLocation()
  const { activeWorkspaceId } = useWorkspaces()
  const me = useAuthStore((s) => s.user)
  const { data: members } = useMembers(activeWorkspaceId)
  const role = (members ?? []).find((m) => m.user_id === me?.id)?.role
  const canModerate = role === "owner" || role === "admin" || session?.room.created_by === me?.id
  // Igual ao Meet, a entrada na sala sempre começa ocupando a tela inteira.
  // A janela flutuante é uma ação explícita de minimizar, nunca o padrão.
  const [layout, setLayout] = useState<"floating" | "fullscreen">("fullscreen")
  const [pipWindow, setPipWindow] = useState<Window | null>(null)
  // O alvo do portal nunca muda. Mover este mesmo nó entre documentos
  // preserva os <video>, srcObject e conexões do LiveKit.
  const [portalHost] = useState(() => {
    const host = document.createElement("div")
    host.dataset.meetingPortal = "true"
    return host
  })
  const previousPathRef = useRef(location.pathname)
  const leave = async () => { if (session) await meetApi.leaveRoom(session.room.id).catch(() => {}); setSession(null) }
  useEffect(() => {
    if (!pipWindow) return
    const onClose = () => setPipWindow(null)
    pipWindow.addEventListener("pagehide", onClose)
    return () => pipWindow.removeEventListener("pagehide", onClose)
  }, [pipWindow])
  useEffect(() => { if (!session && pipWindow && !pipWindow.closed) pipWindow.close() }, [session, pipWindow])
  useEffect(() => {
    if (!session) {
      portalHost.remove()
      return
    }
    const target = pipWindow?.document.body ?? document.body
    target.appendChild(portalHost)
    return () => {
      if (portalHost.parentNode === target) portalHost.remove()
    }
  }, [pipWindow, portalHost, session])
  const openPip = useCallback(async () => {
    if (pipWindow && !pipWindow.closed) { pipWindow.focus(); return }
    const api = (window as Window & typeof globalThis & {
      documentPictureInPicture?: {
        requestWindow: (options?: { width?: number; height?: number }) => Promise<Window>
      }
    }).documentPictureInPicture
    // A API vive em `window`, não em `document`. Sem suporte, mantemos a
    // janela flutuante interna; jamais abrimos outra página do sistema.
    if (!api) { setLayout("floating"); return }
    const next = await api.requestWindow({ width: 520, height: 360 })
    next.document.head.replaceChildren(...Array.from(document.querySelectorAll('link[rel="stylesheet"], style')).map((node) => node.cloneNode(true)))
    next.document.body.style.margin = "0"
    next.document.body.style.height = "100vh"
    next.document.body.className = "dark bg-[#101011]"
    next.document.title = session?.room.name || "Reunião"
    setPipWindow(next)
  }, [pipWindow, session?.room.name])
  // Ao retornar para a página da reunião, a call volta para a tela cheia
  // principal e a janela auxiliar é fechada.
  useEffect(() => {
    const wasOnMeetings = previousPathRef.current.endsWith("/reunioes")
    const isOnMeetings = location.pathname.endsWith("/reunioes")
    previousPathRef.current = location.pathname
    if (isOnMeetings && !wasOnMeetings) {
      if (!pipWindow) return
      if (!pipWindow.closed) pipWindow.close()
      setPipWindow(null)
      setLayout("fullscreen")
      return
    }
    // Navegações programáticas (atalhos e menus) não passam por um <a>.
    // Tentamos abrir a mesma janela completa também nesse caminho; se o
    // navegador exigir gesto, o handler de clique acima já o terá aberto.
    if (!isOnMeetings && session && !pipWindow) void openPip().catch(() => {})
  }, [location.pathname, openPip, pipWindow, session])
  // Links da navegação são capturados antes do roteador. Isso mantém o gesto
  // de clique do usuário, exigido pelo navegador para abrir um pop-up, e leva
  // a call inteira (grade, chat e controles), não um único vídeo.
  useEffect(() => {
    if (!session) return
    const onNavigationClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null
      if (!target || target.target === "_blank" || event.defaultPrevented || event.button !== 0) return
      const destination = new URL(target.href, window.location.href)
      if (destination.origin === window.location.origin && !destination.pathname.endsWith("/reunioes")) void openPip()
    }
    document.addEventListener("click", onNavigationClick, true)
    return () => document.removeEventListener("click", onNavigationClick, true)
  }, [openPip, session])
  // Chrome dispara esta ação ao ocultar a aba de uma videoconferência que tem
  // mic/câmera ativos. Ao contrário do PiP de <video>, ela nos permite abrir
  // o Document PiP com a interface completa da chamada (todos os quadros,
  // chat e controles), exatamente o caso de uso de reuniões.
  useEffect(() => {
    if (!session || !navigator.mediaSession) return
    const mediaSession = navigator.mediaSession as MediaSession & {
      setActionHandler: (action: string, handler: (() => void) | null) => void
    }
    try {
      mediaSession.setActionHandler("enterpictureinpicture", () => { void openPip() })
      return () => mediaSession.setActionHandler("enterpictureinpicture", null)
    } catch {
      // Navegadores sem Auto PiP continuam com o botão manual e o pop-up na
      // navegação interna, sem degradar a chamada.
      return undefined
    }
  }, [openPip, session])
  if (!session) return null
  const content = <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={cx("fixed z-[100] flex flex-col overflow-hidden border border-ink-700 bg-ink-950 shadow-2xl", pipWindow || layout === "fullscreen" ? "inset-0 rounded-none" : "bottom-4 right-4 h-[min(78vh,720px)] w-[min(92vw,1080px)] rounded-2xl")}>
    <div className="flex h-12 shrink-0 items-center gap-2 border-b border-ink-700 bg-ink-900 px-3"><p className="truncate text-sm font-semibold text-paper-200">{session.room.name}</p><span className="ml-auto hidden text-[11px] text-paper-400 sm:block">A chamada continua enquanto você navega</span>{!pipWindow && <button onClick={() => setLayout((v) => v === "fullscreen" ? "floating" : "fullscreen")} title={layout === "fullscreen" ? "Janela flutuante" : "Tela cheia"} className="rounded-lg p-2 text-paper-400 hover:bg-ink-800 hover:text-paper-200">{layout === "fullscreen" ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}</button>}<button onClick={() => void openPip()} title="Abrir pop-up persistente" className="rounded-lg p-2 text-paper-400 hover:bg-ink-800 hover:text-paper-200"><PictureInPicture2 className="size-4" /></button><button onClick={leave} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-paper-400 hover:bg-ink-800 hover:text-paper-200"><X className="size-4" /> Sair</button></div>
    <Suspense fallback={<div className="grid flex-1 place-items-center"><Loader2 className="size-6 animate-spin text-paper-400" /></div>}><LiveKitRoom token={session.token} serverUrl={session.url} connect video audio options={ROOM_OPTIONS} onDisconnected={leave} data-lk-theme="default" className="flex min-h-0 flex-1 flex-col"><MeetingRoomContent roomId={session.room.id} canModerate={canModerate} /><RoomAudioRenderer /></LiveKitRoom></Suspense>
  </motion.div>
  return createPortal(<AnimatePresence>{content}</AnimatePresence>, portalHost)
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

function MeetingRoomContent({ roomId, canModerate }: { roomId: string; canModerate: boolean }) {
  const room = useRoomContext()
  const participants = useParticipants()
  const [chatOpen, setChatOpen] = useState(false)
  const [peopleOpen, setPeopleOpen] = useState(false)
  const [messages, setMessages] = useState<{ from: string; text: string; time: string }[]>([])
  const [draft, setDraft] = useState("")
  useEffect(() => {
    const onData = (payload: Uint8Array, participant?: { name?: string; identity?: string }) => {
      try {
        const data = JSON.parse(new TextDecoder().decode(payload))
        if (data.target && data.target !== room.localParticipant.identity) return
        if (data.type === "chat") setMessages((old) => [...old, { from: participant?.name || participant?.identity || "Participante", text: String(data.text), time: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) }])
        if (data.type === "moderation") {
          if (data.action === "mute") void room.localParticipant.setMicrophoneEnabled(false)
          if (data.action === "camera") void room.localParticipant.setCameraEnabled(false)
        }
      } catch { /* mensagens desconhecidas não afetam a chamada */ }
    }
    room.on("dataReceived", onData)
    return () => { room.off("dataReceived", onData) }
  }, [room])
  const send = () => {
    const text = draft.trim()
    if (!text) return
    void room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify({ type: "chat", text: text.slice(0, 500) })), { reliable: true })
    setMessages((old) => [...old, { from: "Você", text, time: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) }])
    setDraft("")
  }
  return (
    <div className="flex min-h-0 flex-1 basis-0 flex-col">
      <div className="flex min-h-0 flex-1 basis-0">
        <VideoStage />
        {(chatOpen || peopleOpen) && <aside className="flex w-72 shrink-0 flex-col border-l border-ink-700 bg-ink-900 text-paper-200">
          <div className="flex items-center justify-between border-b border-ink-700 px-3 py-3 text-sm font-semibold">
            {chatOpen ? "Chat da reunião" : "Participantes"}
            <button onClick={() => { setChatOpen(false); setPeopleOpen(false) }} className="text-paper-400 hover:text-white"><X className="size-4" /></button>
          </div>
          {chatOpen ? <><div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">{messages.length === 0 && <p className="text-xs text-paper-500">Nenhuma mensagem ainda.</p>}{messages.map((m, i) => <div key={i} className="rounded-lg bg-white/5 p-2"><div className="flex justify-between text-[10px] text-paper-500"><span>{m.from}</span><span>{m.time}</span></div><p className="mt-1 break-words text-sm">{m.text}</p></div>)}</div><form onSubmit={(e) => { e.preventDefault(); send() }} className="flex gap-2 border-t border-ink-700 p-3"><input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Escreva uma mensagem" className="min-w-0 flex-1 rounded-lg bg-ink-800 px-3 py-2 text-xs outline-none ring-brand-500 focus:ring-1" /><button className="grid size-8 place-items-center rounded-lg bg-brand-600 text-white"><Send className="size-4" /></button></form></> : <div className="space-y-2 overflow-y-auto p-3">{participants.map((p) => <div key={p.identity} className="flex items-center gap-2 rounded-lg bg-white/5 p-2 text-xs"><span className="grid size-7 place-items-center rounded-full bg-brand-500/20 text-[10px]">{initialsOf(p.name || p.identity)}</span><span className="min-w-0 flex-1 truncate">{p.name || p.identity}</span>{canModerate && p.identity !== room.localParticipant.identity && <button title="Remover participante" onClick={() => void meetApi.removeParticipant(roomId, p.identity)} className="rounded p-1 text-red-300 hover:bg-red-500/20"><LogOut className="size-3.5" /></button>}</div>)}</div>}
        </aside>}
      </div>
      <MeetControlBar onChat={() => { setChatOpen((v) => !v); setPeopleOpen(false) }} onPeople={() => { setPeopleOpen((v) => !v); setChatOpen(false) }} peopleCount={participants.length} />
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

// Setinha no canto do botão de mic/câmera pra trocar de dispositivo — sem
// isto a pessoa fica presa no mic/câmera que o navegador escolheu por padrão
// na primeira vez, igual o ControlBar padrão da lib já deixava de fazer.
function DeviceMenu({
  kind,
  label,
}: {
  kind: "audioinput" | "videoinput"
  label: string
}) {
  const [open, setOpen] = useState(false)
  const { devices, activeDeviceId, setActiveMediaDevice } = useMediaDeviceSelect({
    kind,
    requestPermissions: true,
  })

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Escolher ${label}`}
        title={`Escolher ${label}`}
        className="absolute -right-1 -top-1 z-10 grid size-5 place-items-center rounded-full bg-ink-700 text-white ring-2 ring-ink-950 hover:bg-ink-600"
      >
        <ChevronUp className="size-3" />
      </button>
      {open && (
        <>
          {/* Fecha ao clicar fora — não precisa fechar sozinho ao escolher
              porque cada opção já fecha explicitamente no onClick. */}
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="scrollbar-slim-dark absolute bottom-full left-1/2 z-30 mb-3 max-h-60 w-64 -translate-x-1/2 overflow-y-auto rounded-lg bg-ink-800 p-1 shadow-lg">
            {devices.length === 0 && (
              <p className="px-3 py-2 text-xs text-white/50">Nenhum dispositivo encontrado</p>
            )}
            {devices.map((d, i) => (
              <button
                key={d.deviceId}
                type="button"
                onClick={() => {
                  setActiveMediaDevice(d.deviceId)
                  setOpen(false)
                }}
                className={cx(
                  "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-[13px] text-white hover:bg-white/10",
                  d.deviceId === activeDeviceId && "bg-white/10",
                )}
              >
                {d.deviceId === activeDeviceId ? (
                  <Check className="size-3.5 shrink-0" />
                ) : (
                  <span className="size-3.5 shrink-0" />
                )}
                <span className="truncate">{d.label || `${label} ${i + 1}`}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </>
  )
}

function MeetControlBar({ onChat, onPeople, peopleCount }: { onChat: () => void; onPeople: () => void; peopleCount: number }) {
  const mic = useTrackToggle({ source: Track.Source.Microphone })
  const camera = useTrackToggle({ source: Track.Source.Camera })
  const screenShare = useTrackToggle({ source: Track.Source.ScreenShare })
  const { buttonProps: disconnectProps } = useDisconnectButton({})

  return (
    <div className="flex items-center justify-center gap-3 bg-ink-950 py-4">
      <div className="relative">
        <CallButton
          variant={mic.enabled ? "default" : "off"}
          onClick={mic.buttonProps.onClick as React.MouseEventHandler<HTMLButtonElement>}
          label={mic.enabled ? "Desativar microfone" : "Ativar microfone"}
        >
          {mic.enabled ? <Mic className="size-5" /> : <MicOff className="size-5" />}
        </CallButton>
        <DeviceMenu kind="audioinput" label="Microfone" />
      </div>
      <div className="relative">
        <CallButton
          variant={camera.enabled ? "default" : "off"}
          onClick={camera.buttonProps.onClick as React.MouseEventHandler<HTMLButtonElement>}
          label={camera.enabled ? "Desativar câmera" : "Ativar câmera"}
        >
          {camera.enabled ? <Video className="size-5" /> : <VideoOff className="size-5" />}
        </CallButton>
        <DeviceMenu kind="videoinput" label="Câmera" />
      </div>
      <CallButton
        variant={screenShare.enabled ? "sharing" : "default"}
        onClick={screenShare.buttonProps.onClick as React.MouseEventHandler<HTMLButtonElement>}
        label={screenShare.enabled ? "Parar compartilhamento" : "Compartilhar tela"}
      >
        <ScreenShare className="size-5" />
      </CallButton>
      <CallButton onClick={onChat} label="Abrir chat"><MessageCircle className="size-5" /></CallButton>
      <CallButton onClick={onPeople} label={`Participantes (${peopleCount})`}><Users className="size-5" /></CallButton>
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

// Tela compartilhada quase nunca tem a mesma proporção do espaço disponível
// (desktop 16:9/16:10 dentro de um recorte mais largo). `object-fit: contain`
// sozinho deixa a sobra como TARJA PRETA dentro do próprio quadro — dá a
// impressão de espaço vazio/quebrado. Aqui o quadro em si é redimensionado
// pra proporção real do vídeo (lida direto do elemento <video>) e centralizado
// no espaço disponível — a sobra vira o fundo escuro ao redor, não uma barra
// dura colada no vídeo.
function SpotlightTile({ trackRef }: { trackRef: TrackReferenceOrPlaceholder }) {
  const outerRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const [videoRatio, setVideoRatio] = useState<number | null>(null)
  const [box, setBox] = useState<{ w: number; h: number } | null>(null)

  // Acha o <video> real (só existe depois que o ParticipantTile termina de
  // montar/anexar a track) e lê a proporção nativa dele.
  useEffect(() => {
    setVideoRatio(null)
    let raf = 0
    let video: HTMLVideoElement | null = null
    const onLoaded = () => {
      if (video && video.videoWidth && video.videoHeight) {
        setVideoRatio(video.videoWidth / video.videoHeight)
      }
    }
    const findVideo = () => {
      video = innerRef.current?.querySelector("video") ?? null
      if (video) {
        onLoaded()
        video.addEventListener("loadedmetadata", onLoaded)
        video.addEventListener("resize", onLoaded)
      } else {
        raf = requestAnimationFrame(findVideo)
      }
    }
    findVideo()
    return () => {
      cancelAnimationFrame(raf)
      video?.removeEventListener("loadedmetadata", onLoaded)
      video?.removeEventListener("resize", onLoaded)
    }
    // `trackRef` é recriado a cada emissão do `useTracks` (nova identidade de
    // objeto mesmo sem mudar a track de verdade) — usar ele como dependência
    // reiniciava a busca do <video> a cada render. participant+source é o
    // que muda de verdade.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackRef.participant.identity, trackRef.source])

  // Faz o "contain" na mão: `width:100%` + `aspect-ratio` não encolhe a
  // largura de volta quando o `max-height` corta a altura calculada — o
  // resultado prático era nenhuma mudança (a caixa ficava do tamanho do
  // container do mesmo jeito, só que agora com a MATEMÁTICA certa aqui).
  useEffect(() => {
    const el = outerRef.current
    if (!el || !videoRatio) {
      setBox(null)
      return
    }
    const update = () => {
      const cw = el.clientWidth
      const ch = el.clientHeight
      if (!cw || !ch) return
      const containerRatio = cw / ch
      if (containerRatio > videoRatio) {
        const h = ch
        setBox({ w: h * videoRatio, h })
      } else {
        const w = cw
        setBox({ w, h: w / videoRatio })
      }
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [videoRatio])

  return (
    <div ref={outerRef} className="flex min-h-0 min-w-0 flex-1 items-center justify-center">
      <div ref={innerRef} style={box ? { width: box.w, height: box.h } : { width: "100%", height: "100%" }}>
        <ParticipantTile trackRef={trackRef} style={{ width: "100%", height: "100%" }} />
      </div>
    </div>
  )
}

function VideoStage() {
  const cameraTracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: true }],
    { onlySubscribed: false },
  )
  // Sem placeholder: uma tela não compartilhada não deve virar quadro vazio.
  const screenTracks = useTracks(
    [{ source: Track.Source.ScreenShare, withPlaceholder: false }],
    { onlySubscribed: false },
  )

  if (screenTracks.length > 0) {
    // Estilo Meet: quem compartilha a tela domina o espaço; o resto vira uma
    // faixa de miniaturas ao lado. Antes a tela compartilhada entrava na
    // mesma grade dos outros, do MESMO tamanho — parecia que tinha entrado
    // gente nova na call, não que alguém tinha compartilhado algo.
    const spotlight = screenTracks[0]
    return (
      <div className="meet-video-stage flex min-h-0 flex-1 basis-0 gap-2 overflow-hidden bg-ink-950 p-2">
        <SpotlightTile trackRef={spotlight} />
        {cameraTracks.length > 0 && (
          <div className="scrollbar-slim-dark flex w-[180px] shrink-0 flex-col gap-2 overflow-y-auto">
            {cameraTracks.map((track, i) => (
              <ParticipantTile
                key={`${track.participant.identity}-${track.source}-${i}`}
                trackRef={track}
                style={{ width: "100%", height: "120px", flexShrink: 0 }}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  // Estilo Meet: quadros do mesmo tamanho preenchendo o espaço, sem sobrar
  // célula vazia quando a contagem não é um quadrado perfeito (3, 5, 6, 7...).
  // O `GridLayout` da lib é uma grade fixa NxN — com 3 pessoas ele monta 2x2
  // e a 4ª célula fica preta. Aqui é flex-wrap com todo quadro do mesmo
  // tamanho: a última linha incompleta centraliza (`justify-content: center`)
  // em vez de deixar vão à direita.
  const count = cameraTracks.length || 1
  const columns = Math.max(1, Math.ceil(Math.sqrt(count)))
  const rows = Math.max(1, Math.ceil(count / columns))

  return (
    <div className="meet-video-stage flex min-h-0 flex-1 basis-0 flex-wrap content-center justify-center gap-2 overflow-hidden bg-ink-950 p-2">
      {cameraTracks.map((track, i) => (
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
