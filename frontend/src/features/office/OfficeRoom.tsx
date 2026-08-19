// Sala do Escritório: ponte entre o motor Canvas e o React.
//
// O React não participa do loop — ele monta o canvas, entrega eventos e mostra
// o HUD. Toda a simulação (movimento, colisão, luz, partículas) roda dentro do
// OfficeEngine em passo fixo, sem provocar re-render a 60fps.
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { Keyboard, MessageSquare, Mic, MicOff, Smile, Video, VideoOff, Volume2, VolumeX } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"

import type { AvatarConfig, Direction } from "@/features/avatar/avatar.types"
import { useAuthStore } from "@/features/auth/auth.store"
import { useMembers } from "@/features/workspace/workspace.hooks"
import { EASE } from "@/shared/lib/motion"
import { Kbd, cx } from "@/shared/ui/primitives"

import { useActivePokerSession, useSession, useSquads } from "@/features/poker/poker.hooks"

import { ElevatorPanel } from "./ElevatorPanel"
import { useDeliveryChampion, useHeartbeat, useRoom } from "./office.hooks"
import { useActiveCard } from "./pc/activeCard.hooks"
import { isMyDesk } from "./pc/desk"
import type { DeskAssignment } from "./pc/desks.api"
import { useDeskAssignments } from "./pc/desks.hooks"
import { usePcStore } from "./pc/pc.store"
import { Win98Desktop } from "./pc/Win98Desktop"
import { PokerConsolePanel } from "./poker/PokerConsolePanel"
import { PokerSeatHint, PokerVoteWheel } from "./poker/PokerVoteWheel"
import { usePokerRoomStore } from "./poker/pokerRoom.store"
import { buildVoteBadges } from "./poker/voteBadges"
import { OfficeEngine } from "./world/engine"
import { buildFloor } from "./world/floors"
import type { OfficeMap } from "./world/map"
import { TILE } from "./world/tiles"
import { useWorldStore } from "./world.store"
import { OfficeVideoOverlay } from "./OfficeVideoOverlay"
import { joinOfficeRoom, type JoinResult } from "@/features/meetings/meetings.api"
import { mediaErrorMessage, type MediaKind } from "@/features/meetings/MediaSync"
import { toast as notify } from "@/shared/ui/toast"
import { formatDoingSince } from "@/shared/lib/businessTime"

// Presença de quem está PARADO. Só evita cair da janela de frescor (30s no
// backend) — não é o caminho do movimento.
const KEEPALIVE_MS = 3000
// Piso entre publicações durante o movimento. 3s de keepalive como único canal
// desenhava o colega até 3s atrás — daí "em cada tela estou num lugar". 150ms
// dá ~7 amostras/s, suficiente para a interpolação do cliente suavizar sem
// transformar cada passo numa requisição.
const MOVE_PUBLISH_MS = 150

/** Andar da sala de Planning Poker (ver world/floors/index.ts). */
const POKER_FLOOR = 2

// Emotes: reusam clipes que o gerador de avatar já sabe animar.
const EMOTES: { anim: string; label: string; icon: string }[] = [
  { anim: "wave", label: "Acenar", icon: "👋" },
  { anim: "dance", label: "Dançar", icon: "🕺" },
  { anim: "jamal", label: "Passinho", icon: "🔥" },
  { anim: "dab", label: "Dab", icon: "😎" },
  { anim: "celebrate", label: "Comemorar", icon: "🎉" },
  { anim: "sleep", label: "Cochilar", icon: "😴" },
]

export function OfficeRoom({
  workspaceId,
  myConfig,
}: {
  workspaceId: string
  myConfig: AvatarConfig
}) {
  const me = useAuthStore((s) => s.user)
  const floor = useWorldStore((s) => s.floor)
  const queryWorkspaceId = workspaceId
  const room = useRoom(queryWorkspaceId, floor)
  const deliveryChampionQuery = useDeliveryChampion(queryWorkspaceId)
  const heartbeat = useHeartbeat()
  const reduce = useReducedMotion()

  // A listagem do workspace só serve para descobrir QUAL sessão está ativa:
  // o serializer da lista devolve apenas contadores agregados, sem
  // `participants`/`votes`. O detalhe (useSession) é quem traz esses campos.
  const activeSession = useActivePokerSession(queryWorkspaceId).data ?? null
  const voteSeatId = usePokerRoomStore((s) => s.voteSeatId)
  const onPokerFloor = floor === POKER_FLOOR
  // Só polla o detalhe onde ele é usado (as plaquinhas do andar 2).
  const sessionDetail =
    useSession(onPokerFloor ? (activeSession?.id ?? null) : null).data ?? null

  const deskAssignments = useDeskAssignments(queryWorkspaceId, floor)

  // Owner/admin conseguem ligar QUALQUER PC mesmo sem mesa atribuída — sem
  // isso, ninguém abre o "Mesas" pela primeira vez (a mesa de todo mundo,
  // incluindo a do owner, começa livre, então isMyDesk nunca é true até
  // alguém já ter atribuído algo — trava circular numa instalação nova).
  const members = useMembers(queryWorkspaceId)
  const myRole = (members.data ?? []).find((m) => m.user_id === me?.id)?.role ?? null
  const canManageDesks = myRole === "owner" || myRole === "admin"

  const navigate = useNavigate()
  const [hoverUserId, setHoverUserId] = useState<string | null>(null)
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null)
  // Espelho de hoverPos lido dentro do onCanvasMouseMove (callback estável).
  const hoverPosRef = useRef<{ x: number; y: number } | null>(null)
  // Fechamento com atraso: o balão flutua ACIMA do avatar, então o caminho do
  // mouse até ele cruza canvas "vazio" no meio — sem isto o balão fechava
  // antes de o cursor chegar (e fechava de novo ao tentar rolar a lista).
  const hoverCloseTimerRef = useRef<number | null>(null)
  const cancelHoverClose = useCallback(() => {
    if (hoverCloseTimerRef.current !== null) {
      window.clearTimeout(hoverCloseTimerRef.current)
      hoverCloseTimerRef.current = null
    }
  }, [])
  const closeHoverNow = useCallback(() => {
    cancelHoverClose()
    setHoverUserId(null)
    hoverPosRef.current = null
    setHoverPos(null)
  }, [cancelHoverClose])
  const scheduleHoverClose = useCallback(() => {
    cancelHoverClose()
    hoverCloseTimerRef.current = window.setTimeout(closeHoverNow, 100)
  }, [cancelHoverClose, closeHoverNow])
  useEffect(() => cancelHoverClose, [cancelHoverClose])
  const activeCard = useActiveCard(queryWorkspaceId, hoverUserId, canManageDesks)
  const myActiveCard = useActiveCard(queryWorkspaceId, me?.id ?? null, true)
  const roomMembers = room.data
  const deliveryChampion = deliveryChampionQuery.data
  const currentDeskAssignments = useMemo(
    () => deskAssignments.data ?? [],
    [deskAssignments.data],
  )
  const hoveredCard = activeCard.data
  const { data: squads = [] } = useSquads(queryWorkspaceId)
  const squadDoHover = hoverUserId
    ? squads.find((sq) => sq.members.some((m) => m.user_id === hoverUserId))
    : undefined

  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // Instante da última publicação de posição — base do throttle do movimento.
  const lastPublishRef = useRef(0)
  const publishRef = useRef<(() => void) | null>(null)
  const engineRef = useRef<OfficeEngine | null>(null)
  // Contador de "engine pronto". O efeito de presença precisa rodar de novo
  // quando o motor nasce: a primeira amostra da sala costuma chegar ANTES do
  // engine existir, e naquele instante a sincronia era descartada.
  const [engineEpoch, setEngineEpoch] = useState(0)
  const liveRef = useRef<{ x: number; y: number; facing: Direction }>({
    x: 0.5,
    y: 0.5,
    facing: "down",
  })
  // Id da zona atual (não o rótulo): é o que diferencia "elevador" de
  // qualquer outra zona no onInteract, sem esperar o próximo render.
  const zoneIdRef = useRef<string | null>(null)
  // onInteract é criado uma única vez (efeito de montagem do motor, deps
  // [map]) — fechar sobre `deskAssignments.data`/`canManageDesks` direto
  // congelaria os valores de quando o engine foi criado (undefined/[] e
  // false, respectivamente, já que as queries ainda não resolveram nesse
  // instante). Guardamos os valores atuais em refs, atualizados sempre que
  // mudam, e o onInteract lê `.current` — mesmo motivo do
  // `useWorldStore.getState()` no branch do elevador logo abaixo.
  const deskAssignmentsRef = useRef<DeskAssignment[]>([])
  const canManageDesksRef = useRef(false)

  const [zone, setZone] = useState<{ label: string; hint: string } | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [chatOpen, setChatOpen] = useState(false)
  const [chatText, setChatText] = useState("")
  const [emoteOpen, setEmoteOpen] = useState(false)
  const [muted, setMuted] = useState(true)
  const [officeSession, setOfficeSession] = useState<JoinResult | null>(null)
  const [voiceEnabled, setVoiceEnabled] = useState(false)
  const [cameraEnabled, setCameraEnabled] = useState(false)
  const joiningMedia = useRef(false)

  const pcState = usePcStore((s) => s.state)
  const bootPc = usePcStore((s) => s.boot)
  const shutdownPc = usePcStore((s) => s.shutdown)
  const expandedId = usePcStore((s) => s.expandedId)
  const collapsePc = usePcStore((s) => s.collapse)

  // buildFloor lança para andar inexistente ou em obras. O store só deixa ir
  // a andar liberado, mas se o estado vier inconsistente (ex.: hot reload),
  // cai de volta para o térreo em vez de explodir a tela toda.
  const map = useMemo(() => {
    try {
      return buildFloor(floor)
    } catch {
      return buildFloor(1)
    }
  }, [floor])

  // ── Motor ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return

    const engine = new OfficeEngine(canvas, map, {
      onZoneChange: (id, label, hint) => {
        zoneIdRef.current = id
        setZone(label ? { label, hint } : null)
      },
      onMove: (x, y, facing) => {
        liveRef.current = { x, y, facing }
        // Publica durante o movimento, não só no keepalive: sem isto a posição
        // que os outros veem fica até 3s velha. `performance.now()` porque só
        // interessa o intervalo, não a hora do dia.
        const now = performance.now()
        if (now - lastPublishRef.current >= MOVE_PUBLISH_MS) {
          lastPublishRef.current = now
          publishRef.current?.()
        }
      },
      onInteract: (seat) => {
        // Dentro da cabine, E chama o painel do elevador em vez de procurar
        // assento. useWorldStore.getState() em vez de fechar sobre `floor`:
        // este efeito só remonta quando `map` muda, então uma closure sobre
        // `floor` ficaria presa no valor de quando o engine foi criado.
        if (!seat && zoneIdRef.current === "elevator") {
          useWorldStore.getState().openPanel()
          return
        }
        // O console do andar 2 abre o painel de host em vez de mostrar toast
        // de "de pé" — mesma lógica do elevador, zona sem assento.
        if (!seat && zoneIdRef.current === "poker-console") {
          usePokerRoomStore.getState().openConsole()
          return
        }
        setToast(seat ? seat.label : "De pé")
        // Só a mesa da própria pessoa liga o computador. Sentar em qualquer
        // outro assento continua sendo só sentar. Assento da mesa de poker
        // abre a roda de votos em vez de ligar o PC.
        const mine = seat && me?.id && isMyDesk(me.id, seat, deskAssignmentsRef.current)
        if (seat && seat.kind === "pc" && (mine || canManageDesksRef.current)) bootPc(seat.id)
        else if (seat && seat.kind === "poker") {
          usePokerRoomStore.getState().openVote(seat.id)
        } else if (!seat) {
          shutdownPc()
          usePokerRoomStore.getState().closeVote()
        }
      },
    })
    engineRef.current = engine
    setEngineEpoch((n) => n + 1)

    engine.spawnSelf(me?.id ?? "me", me?.full_name ?? "Você", myConfig)

    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      engine.resize(Math.max(160, width), Math.max(120, height))
    })
    ro.observe(wrap)

    window.addEventListener("keydown", engine.onKeyDown)
    window.addEventListener("keyup", engine.onKeyUp)
    engine.start()

    return () => {
      engine.stop()
      ro.disconnect()
      window.removeEventListener("keydown", engine.onKeyDown)
      window.removeEventListener("keyup", engine.onKeyUp)
      engineRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map])

  // Config do avatar mudou no Lab → recarrega o spritesheet sem recriar a cena.
  useEffect(() => {
    engineRef.current?.updateSelfConfig(myConfig)
  }, [myConfig])

  // Atribuições de mesa (de quem é cada uma) — vêm do backend, não mais hash.
  // O brilho da própria mesa depende das atribuições e do mapa: recalcula
  // sempre que qualquer um dos dois mudar.
  //
  // `engineEpoch` pelo mesmo motivo da sincronia de presença: as atribuições
  // costumam chegar ANTES de o motor existir, e aí o `return` descartava a
  // chamada. Como o React Query devolve a MESMA referência quando o payload
  // volta deep-equal (structural sharing), o poll de 15s não disparava o efeito
  // de novo — e o brilho nunca aparecia, mesmo com mesa atribuída.
  //
  // A ref é atualizada fora do guard: o `onInteract` a lê pra decidir se liga o
  // PC, e isso não pode depender de o motor já ter nascido.
  useEffect(() => {
    const rows = currentDeskAssignments
    deskAssignmentsRef.current = rows
    const engine = engineRef.current
    if (!engine) return
    engine.setMyDesk(me?.id ? rows.find((r) => r.user_id === me.id)?.seat_id ?? null : null)
  }, [currentDeskAssignments, me?.id, map, engineEpoch])

  // Entrar no Escritório já com um card em andamento coloca a pessoa na sua
  // mesa sem abrir o PC. O próprio `seatSelfAt` publica um heartbeat imediato,
  // então os demais clientes também a veem trabalhando.
  useEffect(() => {
    if (!myActiveCard.data?.active || !me?.id) return
    const seatId = currentDeskAssignments.find((row) => row.user_id === me.id)?.seat_id
    if (seatId) engineRef.current?.seatSelfAt(seatId)
  }, [myActiveCard.data?.active, me?.id, currentDeskAssignments, engineEpoch])

  // canManageDesks só é conhecido depois que useMembers resolve — atualiza a
  // ref lida pelo onInteract (ver comentário acima de canManageDesksRef).
  useEffect(() => {
    canManageDesksRef.current = canManageDesks
  }, [canManageDesks])

  // Presença dos outros → atores da cena.
  //
  // `engineEpoch` na lista de dependências é o que corrige "entrei e estou
  // sozinho": quem entra depois recebe a primeira amostra da sala antes de o
  // motor existir, e o `?.` descartava a chamada sem erro. Como o React Query
  // reaproveita a MESMA referência quando o payload volta deep-equal (structural
  // sharing), com todos parados o efeito nunca rodava de novo — e os colegas
  // jamais entravam na cena. Movimentar alguém "consertava", porque mudava o
  // payload. Agora o nascimento do motor também dispara a sincronia.
  useEffect(() => {
    const engine = engineRef.current
    if (!engine || !roomMembers) return
    engine.syncRemote(roomMembers)
  }, [roomMembers, engineEpoch])

  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return
    const config = deliveryChampion?.avatar_config
    engine.setAirshipChampion(
      deliveryChampion && config
        ? { name: deliveryChampion.name, deliveries: deliveryChampion.deliveries, config }
        : null,
    )
  }, [deliveryChampion, engineEpoch])

  // Reflete o estado da sessão de poker ativa nas plaquinhas acima da
  // cabeça — sem sessão ativa, zera tudo (ninguém com plaquinha visível).
  // Fora do andar do poker, zera: sem isso as plaquinhas apareciam sobre os
  // avatares do bullpen (andar 1), que não estão em votação nenhuma.
  //
  // `engineEpoch` pelo mesmo motivo dos outros dois efeitos de motor: quem
  // chega no andar 2 com votação já rolando recebe o `sessionDetail` antes de o
  // motor nascer, e o poll devolve a mesma referência enquanto ninguém mexe no
  // voto — as plaquinhas nunca subiam.
  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return
    if (!onPokerFloor || !sessionDetail) {
      engine.setPokerVotes(new Map(), false)
      return
    }
    engine.setPokerVotes(
      buildVoteBadges(sessionDetail),
      sessionDetail.status === "revealed",
    )
  }, [sessionDetail, onPokerFloor, map, engineEpoch])

  // Publicação de presença. Dois gatilhos: o movimento (via `publishRef`, com
  // throttle) e este intervalo, que cobre quem está parado.
  useEffect(() => {
    const send = () => {
      lastPublishRef.current = performance.now()
      heartbeat.mutate({
        workspace_id: workspaceId,
        x: liveRef.current.x,
        y: liveRef.current.y,
        facing: liveRef.current.facing,
        // getState() em vez de fechar sobre `floor`: este efeito só depende
        // de `workspaceId`, então o closure sobre `floor` ficaria velho após
        // trocar de andar sem remontar o keepalive.
        floor: useWorldStore.getState().floor,
      })
    }
    // O engine chama isto pelo ref: ele é criado num efeito com deps próprias
    // e não pode fechar sobre este `send`.
    publishRef.current = send
    send()
    const t = window.setInterval(send, KEEPALIVE_MS)
    return () => {
      window.clearInterval(t)
      publishRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId])

  // O toast de interação some sozinho.
  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 1800)
    return () => window.clearTimeout(t)
  }, [toast])

  // Com a tela ligada, o teclado passa a ser do PC. O mapa continua no mesmo
  // enquadramento: o desktop é só uma camada por cima do escritório.
  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return
    if (pcState === "off") {
      engine.setInputEnabled(true)
      engine.clearFocus()
      return
    }
    engine.setInputEnabled(false)
  }, [pcState, map])

  // ESC: colapsa a janela expandida; se não houver, só desliga o PC. Quem
  // levanta o avatar no mundo é sempre o efeito abaixo — dois donos para o
  // mesmo "levantar" já causou dessincronia com o motor (store sobrevive à
  // navegação) e, se um assento cair perto do spawn, um loop liga→desliga→senta.
  useEffect(() => {
    if (pcState === "off") return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      e.preventDefault()
      if (expandedId) collapsePc()
      else shutdownPc()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [pcState, expandedId, collapsePc, shutdownPc])

  // Único caminho para levantar o avatar no mundo quando o PC desliga —
  // seja pelo ESC acima, seja pela Taskbar.
  useEffect(() => {
    if (pcState !== "off") return
    const engine = engineRef.current
    if (engine?.isSeated()) engine.tryInteract()
  }, [pcState])

  // O store do PC é global e sobrevive à navegação: sem isso, voltar para o
  // Escritório remontaria com a tela ligada e o avatar de pé — teclado morto.
  useEffect(() => () => usePcStore.getState().shutdown(), [])

  // Mesmo motivo para o store do poker — e também a cada troca de andar: sem
  // isto, pegar o elevador sentado na mesa deixava a roda de cartas flutuando
  // no andar 1, votando na sessão do andar 2.
  useEffect(
    () => () => {
      const poker = usePokerRoomStore.getState()
      poker.closeVote()
      poker.closeConsole()
    },
    [map],
  )

  const onCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const engine = engineRef.current
    if (!engine) return
    const localX = e.clientX - rect.left
    const localY = e.clientY - rect.top

    // Clicou num colega com card ativo: abre o board dele direto no card,
    // em vez de andar até lá — é o mesmo hit-test do hover, então só
    // navega quando já temos o card carregado pra esse usuário (evita
    // clique cru virar navegação errada por causa de uma resposta velha).
    if (canManageDesks) {
      const clickedUserId = engine.hoverSeatAt(localX, localY)
      if (clickedUserId && clickedUserId === hoverUserId && hoveredCard?.active) {
        const card = hoveredCard.cards?.[0]
        if (card) {
          navigate(`/app/boards?project=${card.project_id}&card=${card.id}`)
          return
        }
      }
    }

    engine.clickTo(localX, localY)
    // clickTo levanta o avatar sem passar pelo onInteract — quem estava
    // sentado na mesa de poker precisa perder a roda de cartas aqui.
    if (!engine.isSeated()) usePokerRoomStore.getState().closeVote()
  }, [canManageDesks, hoverUserId, hoveredCard, navigate])

  const onCanvasMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const engine = engineRef.current
    if (!engine) return
    const localX = e.clientX - rect.left
    const localY = e.clientY - rect.top
    const userId = engine.hoverSeatAt(localX, localY)
    // Mousemove dispara dezenas de vezes por segundo; sem limiar, cada pixel
    // re-renderizava a árvore toda. A ref espelha o último valor aplicado pra
    // comparar sem entrar nas deps do callback (que precisa ser estável).
    if (!userId) {
      // Não fecha na hora: pode ser só o trecho de canvas vazio entre o
      // avatar e o balão (que fica acima dele), a caminho de rolar a lista.
      scheduleHoverClose()
      return
    }
    cancelHoverClose()
    setHoverUserId(userId)
    const prev = hoverPosRef.current
    if (prev && Math.abs(prev.x - localX) <= 2 && Math.abs(prev.y - localY) <= 2) return
    hoverPosRef.current = { x: localX, y: localY }
    setHoverPos({ x: localX, y: localY })
  }, [cancelHoverClose, scheduleHoverClose])

  const onCanvasMouseLeave = useCallback(() => {
    scheduleHoverClose()
  }, [scheduleHoverClose])

  const sendChat = () => {
    const text = chatText.trim()
    if (text) engineRef.current?.say(text)
    setChatText("")
    setChatOpen(false)
  }

  // Enter abre o chat; Esc fecha. Fora de input, para não roubar digitação.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Com o PC ligado o teclado é da página embutida: engolir Enter aqui
      // impediria ativar botão ou link por teclado dentro da janela.
      if (pcState !== "off") return
      const target = e.target as HTMLElement | null
      const typing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA"
      if (e.key === "Enter" && !typing) {
        e.preventDefault()
        setChatOpen(true)
      }
      if (e.key === "Escape") {
        setChatOpen(false)
        setEmoteOpen(false)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [pcState])

  const online = roomMembers?.length ?? 1
  // Só acende o botão se a entrada na sala der certo — aceso sem sala é a
  // aparência de "liguei e não ligou". O guard evita que dois cliques rápidos
  // abram duas conexões.
  const enableMedia = async (kind: "voice" | "camera") => {
    const next = kind === "voice" ? !voiceEnabled : !cameraEnabled
    if (next && !officeSession) {
      if (joiningMedia.current) return
      joiningMedia.current = true
      try {
        setOfficeSession(await joinOfficeRoom(workspaceId, floor))
      } catch {
        notify.error("Não foi possível entrar na sala de voz deste andar.")
        return
      } finally {
        joiningMedia.current = false
      }
    }
    if (kind === "voice") setVoiceEnabled(next)
    else setCameraEnabled(next)
  }

  // Permissão negada, dispositivo ocupado, publicação recusada: desfaz o botão
  // para ele não ficar aceso mentindo que a mídia está no ar.
  const handleMediaError = (kind: MediaKind, error: unknown) => {
    if (kind === "video") setCameraEnabled(false)
    else setVoiceEnabled(false)
    notify.error(mediaErrorMessage(kind, error))
  }

  return (
    <div
      ref={wrapRef}
      className="relative size-full select-none overflow-hidden bg-[#1a1712]"
    >
      <canvas
        ref={canvasRef}
        onClick={onCanvasClick}
        onMouseMove={onCanvasMouseMove}
        onMouseLeave={onCanvasMouseLeave}
        className="absolute inset-0 size-full cursor-pointer"
        style={{ imageRendering: "pixelated" }}
        aria-label="Escritório virtual — use WASD ou clique para andar"
      />
      {officeSession && <OfficeVideoOverlay session={officeSession} engine={engineRef} audio={voiceEnabled} video={cameraEnabled} onMediaError={handleMediaError} />}

      {canManageDesks && hoverUserId && hoverPos && hoveredCard && (
        <div
          className="pointer-events-auto absolute z-20 flex max-w-[220px] flex-col rounded-md border border-gray-700 bg-gray-900/95 px-3 py-2 text-xs text-white shadow-lg"
          /* Clamp no topo: sem isto, passar o mouse num avatar perto da borda
             de cima jogava o balão pra `top` negativo (cortado, invisível). */
          style={{ left: hoverPos.x, top: Math.max(hoverPos.y - 70, 4), maxHeight: 260 }}
          // Balão interativo agora (tinha vários cards e nenhum jeito de rolar
          // até o fim) — o hover com atraso em onCanvasMouseMove/MouseLeave é
          // o que evita ele fechar sozinho ao tentar alcançá-lo ou rolar.
          onMouseEnter={cancelHoverClose}
          onMouseLeave={closeHoverNow}
        >
          {/* Squad de quem está sob o cursor: identifica o time sem mudar nada
              do que a pessoa acessa. */}
          {squadDoHover && (
            <div className="mb-1 flex shrink-0 items-center gap-1.5">
              <span
                className="size-1.5 rounded-full"
                style={{ backgroundColor: squadDoHover.color }}
              />
              <span className="text-[11px] font-medium" style={{ color: squadDoHover.color }}>
                {squadDoHover.name}
              </span>
            </div>
          )}
          {hoveredCard.active ? (
            <div className="scrollbar-slim-dark overflow-y-auto">
              {hoveredCard.cards!.map((card, i) => (
                <div
                  key={card.id}
                  // O balão fica flutuando POR CIMA do boneco — clicar nele é o
                  // gesto natural (é o que está embaixo do cursor), não só
                  // acertar o pixel exato do avatar por baixo.
                  onClick={() => navigate(`/app/boards?project=${card.project_id}&card=${card.id}`)}
                  className={cx(
                    "cursor-pointer rounded px-1 py-0.5 -mx-1 hover:bg-white/10",
                    i > 0 && "mt-1.5 border-t border-gray-700 pt-1.5",
                  )}
                >
                  <div className="font-semibold">
                    #{card.number} {card.title}
                  </div>
                  <div className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
                    {card.project}
                  </div>
                  <div className="text-gray-300">
                    há {formatDoingSince(card.doing_since)} em andamento
                  </div>
                  {card.working_note && (
                    <div className="mt-1 text-gray-200">{card.working_note}</div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-gray-300">Sem card ativo</div>
          )}
        </div>
      )}

      <Win98Desktop />

      <ElevatorPanel />
      {/* Poker só existe no andar 2 — segunda linha de defesa além do
          reset do store na troca de andar. */}
      {onPokerFloor && <PokerConsolePanel />}
      {onPokerFloor &&
        voteSeatId &&
        (activeSession ? (
          <PokerVoteWheel
            sessionId={activeSession.id}
            status={activeSession.status}
            onClose={() => usePokerRoomStore.getState().closeVote()}
          />
        ) : (
          <PokerSeatHint>Aguardando sessão — abra pelo console</PokerSeatHint>
        ))}

      {/* Rótulo da zona atual — só faz sentido com o PC desligado */}
      <AnimatePresence>
        {pcState === "off" && zone && (
          <motion.div
            key={zone.label}
            initial={reduce ? false : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            transition={{ duration: 0.22, ease: EASE }}
            className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-md bg-ink-950/75 px-3 py-1.5 text-center backdrop-blur-sm"
          >
            <p className="text-[13px] font-semibold text-white">{zone.label}</p>
            <p className="text-[11px] text-white/70">{zone.hint}</p>
            <p className="text-[11px] text-white/50">Andar {floor}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast de interação (sentar/levantar) — só com o PC desligado */}
      <AnimatePresence>
        {pcState === "off" && toast && (
          <motion.div
            key={toast}
            initial={reduce ? false : { opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            transition={{ duration: 0.18, ease: EASE }}
            className="pointer-events-none absolute bottom-24 left-1/2 -translate-x-1/2 rounded-md bg-brand-500/90 px-3 py-1 text-[12px] font-medium text-white"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {pcState === "off" && <Minimap map={map} engineRef={engineRef} online={online} />}

      {/* Barra de comandos — só com o PC desligado */}
      {pcState === "off" && (
        <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-lg bg-ink-950/70 p-1.5 backdrop-blur-sm">
          <HudButton onClick={() => setChatOpen((v) => !v)} active={chatOpen} title="Falar (Enter)">
            <MessageSquare className="size-4" />
          </HudButton>
          <HudButton onClick={() => setEmoteOpen((v) => !v)} active={emoteOpen} title="Emotes">
            <Smile className="size-4" />
          </HudButton>
          <HudButton onClick={() => enableMedia("voice")} active={voiceEnabled} title={voiceEnabled ? "Desligar microfone" : "Ligar microfone"}>
            {voiceEnabled ? <Mic className="size-4" /> : <MicOff className="size-4" />}
          </HudButton>
          <HudButton onClick={() => enableMedia("camera")} active={cameraEnabled} title={cameraEnabled ? "Desligar câmera" : "Ligar câmera"}>
            {cameraEnabled ? <Video className="size-4" /> : <VideoOff className="size-4" />}
          </HudButton>
          <HudButton
            onClick={() => engineRef.current?.tryInteract()}
            title="Sentar / levantar (E)"
          >
            <span className="text-[11px] font-bold">E</span>
          </HudButton>
          <HudButton onClick={() => setMuted((v) => !v)} title={muted ? "Sons desligados" : "Sons ligados"}>
            {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
          </HudButton>
          <span className="mx-1 h-5 w-px bg-white/15" />
          <span className="hidden items-center gap-1.5 pr-1.5 text-[10px] text-white/60 sm:flex">
            <Keyboard className="size-3.5" />
            <Kbd>WASD</Kbd> andar · <Kbd>Shift</Kbd> correr · <Kbd>E</Kbd> sentar
          </span>
        </div>
      )}

      {/* Roda de emotes — só com o PC desligado */}
      <AnimatePresence>
        {pcState === "off" && emoteOpen && (
          <motion.div
            key="emotes"
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            transition={{ duration: 0.18, ease: EASE }}
            className="absolute bottom-16 left-1/2 flex -translate-x-1/2 gap-1 rounded-lg bg-ink-950/80 p-1.5 backdrop-blur-sm"
          >
            {EMOTES.map((emote) => (
              <button
                key={emote.anim}
                type="button"
                title={emote.label}
                onClick={() => {
                  engineRef.current?.emote(emote.anim)
                  setEmoteOpen(false)
                }}
                className="grid size-9 place-items-center rounded-md text-lg transition-colors hover:bg-white/15 focus-ring"
              >
                {emote.icon}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Caixa de fala — só com o PC desligado */}
      <AnimatePresence>
        {pcState === "off" && chatOpen && (
          <motion.form
            key="chat"
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            transition={{ duration: 0.18, ease: EASE }}
            onSubmit={(e) => {
              e.preventDefault()
              sendChat()
            }}
            className="absolute bottom-16 left-1/2 flex w-[min(420px,90%)] -translate-x-1/2 items-center gap-2 rounded-lg bg-ink-950/85 p-1.5 backdrop-blur-sm"
          >
            <input
              autoFocus
              value={chatText}
              maxLength={90}
              onChange={(e) => setChatText(e.target.value)}
              placeholder="Dizer algo…"
              className="h-8 w-full rounded-md bg-white/10 px-2.5 text-[13px] text-white placeholder:text-white/40 focus:outline-none"
            />
            <button
              type="submit"
              className="h-8 shrink-0 rounded-md bg-brand-500 px-3 text-[12px] font-medium text-white transition-colors hover:bg-brand-600 focus-ring"
            >
              Falar
            </button>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  )
}

function HudButton({
  children,
  onClick,
  title,
  active = false,
}: {
  children: React.ReactNode
  onClick: () => void
  title: string
  active?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={cx(
        "grid size-8 place-items-center rounded-md text-white transition-colors duration-150 focus-ring",
        active ? "bg-brand-500" : "hover:bg-white/15",
      )}
    >
      {children}
    </button>
  )
}

/** Minimapa: planta simplificada + posição de todo mundo, redesenhado a 6fps. */
function Minimap({
  map,
  engineRef,
  online,
}: {
  map: OfficeMap
  engineRef: React.MutableRefObject<OfficeEngine | null>
  online: number
}) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")!
    ctx.imageSmoothingEnabled = false
    const w = map.cols
    const h = map.rows
    canvas.width = w
    canvas.height = h

    // A planta é estática: pinta uma vez num buffer e reusa.
    const base = document.createElement("canvas")
    base.width = w
    base.height = h
    const bctx = base.getContext("2d")!
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const solid = map.collision[y * w + x]
        const floorId = map.floor[y * w + x]
        if (floorId === 0) continue
        bctx.fillStyle = solid ? "rgba(43,30,26,0.75)" : "rgba(233,226,212,0.5)"
        bctx.fillRect(x, y, 1, 1)
      }
    }
    for (const zone of map.zones) {
      bctx.fillStyle = zone.accent
      bctx.globalAlpha = 0.35
      bctx.fillRect(zone.x, zone.y, zone.w, zone.h)
      bctx.globalAlpha = 1
    }

    let raf = 0
    let last = 0
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop)
      if (t - last < 160) return // 6fps basta para um minimapa
      last = t
      ctx.clearRect(0, 0, w, h)
      ctx.drawImage(base, 0, 0)
      const engine = engineRef.current
      if (!engine) return
      for (const actor of engine.actorList()) {
        ctx.fillStyle = actor.self ? "#0C66E4" : "#4BCE97"
        const mx = Math.round(actor.x / TILE)
        const my = Math.round(actor.y / TILE)
        ctx.fillRect(mx - 1, my - 1, actor.self ? 3 : 2, actor.self ? 3 : 2)
      }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [map, engineRef])

  return (
    <div className="pointer-events-none absolute right-3 top-3 rounded-md bg-ink-950/70 p-1.5 backdrop-blur-sm">
      <canvas
        ref={ref}
        className="block w-[132px]"
        style={{ imageRendering: "pixelated" }}
        aria-hidden="true"
      />
      <p className="mt-1 text-center text-[10px] text-white/70">
        {online} {online === 1 ? "pessoa" : "pessoas"} online
      </p>
    </div>
  )
}
