// Sala do Escritório: ponte entre o motor Canvas e o React.
//
// O React não participa do loop — ele monta o canvas, entrega eventos e mostra
// o HUD. Toda a simulação (movimento, colisão, luz, partículas) roda dentro do
// OfficeEngine em passo fixo, sem provocar re-render a 60fps.
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { Keyboard, MessageSquare, Smile, Volume2, VolumeX } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import type { AvatarConfig, Direction } from "@/features/avatar/avatar.types"
import { useAuthStore } from "@/features/auth/auth.store"
import { EASE } from "@/shared/lib/motion"
import { Kbd, cx } from "@/shared/ui/primitives"

import { useActivePokerSession, useSession } from "@/features/poker/poker.hooks"

import { ElevatorPanel } from "./ElevatorPanel"
import { useHeartbeat, useRoom } from "./office.hooks"
import { isMyDesk, myDeskId } from "./pc/desk"
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

const KEEPALIVE_MS = 3000

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
  const room = useRoom(workspaceId, floor)
  const heartbeat = useHeartbeat()
  const reduce = useReducedMotion()

  // A listagem do workspace só serve para descobrir QUAL sessão está ativa:
  // o serializer da lista devolve apenas contadores agregados, sem
  // `participants`/`votes`. O detalhe (useSession) é quem traz esses campos.
  const activeSession = useActivePokerSession(workspaceId).data ?? null
  const voteSeatId = usePokerRoomStore((s) => s.voteSeatId)
  const onPokerFloor = floor === POKER_FLOOR
  // Só polla o detalhe onde ele é usado (as plaquinhas do andar 2).
  const sessionDetail =
    useSession(onPokerFloor ? (activeSession?.id ?? null) : null).data ?? null

  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<OfficeEngine | null>(null)
  const liveRef = useRef<{ x: number; y: number; facing: Direction }>({
    x: 0.5,
    y: 0.5,
    facing: "down",
  })
  // Id da zona atual (não o rótulo): é o que diferencia "elevador" de
  // qualquer outra zona no onInteract, sem esperar o próximo render.
  const zoneIdRef = useRef<string | null>(null)

  const [zone, setZone] = useState<{ label: string; hint: string } | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [chatOpen, setChatOpen] = useState(false)
  const [chatText, setChatText] = useState("")
  const [emoteOpen, setEmoteOpen] = useState(false)
  const [muted, setMuted] = useState(true)

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
        if (seat && me?.id && isMyDesk(me.id, seat, map.seats)) bootPc(seat.id)
        else if (seat && seat.kind === "poker") {
          usePokerRoomStore.getState().openVote(seat.id)
        } else if (!seat) {
          shutdownPc()
          usePokerRoomStore.getState().closeVote()
        }
      },
    })
    engineRef.current = engine

    engine.spawnSelf(me?.id ?? "me", me?.full_name ?? "Você", myConfig)
    engine.setMyDesk(me?.id ? myDeskId(me.id, map.seats) : null)

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

  // Presença dos outros → atores da cena.
  useEffect(() => {
    if (!room.data) return
    engineRef.current?.syncRemote(room.data)
  }, [room.data])

  // Reflete o estado da sessão de poker ativa nas plaquinhas acima da
  // cabeça — sem sessão ativa, zera tudo (ninguém com plaquinha visível).
  // Fora do andar do poker, zera: sem isso as plaquinhas apareciam sobre os
  // avatares do bullpen (andar 1), que não estão em votação nenhuma.
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
  }, [sessionDetail, onPokerFloor, map])

  // Keepalive: mantém a presença viva mesmo parado.
  useEffect(() => {
    const send = () =>
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
    send()
    const t = window.setInterval(send, KEEPALIVE_MS)
    return () => window.clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId])

  // O toast de interação some sozinho.
  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 1800)
    return () => window.clearTimeout(t)
  }, [toast])

  // O PC manda no teclado e na câmera: com a tela ligada, o mapa não recebe
  // tecla, e a câmera trava na mesa.
  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return
    if (pcState === "off") {
      engine.setInputEnabled(true)
      engine.clearFocus()
      return
    }
    const seatId = usePcStore.getState().seatId
    const seat = map.seats.find((s) => s.id === seatId)
    engine.setInputEnabled(false)
    if (seat) engine.focusOn(seat.x, seat.y, 6)
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
    engine.clickTo(e.clientX - rect.left, e.clientY - rect.top)
    // clickTo levanta o avatar sem passar pelo onInteract — quem estava
    // sentado na mesa de poker precisa perder a roda de cartas aqui.
    if (!engine.isSeated()) usePokerRoomStore.getState().closeVote()
  }, [])

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

  const online = room.data?.length ?? 1

  return (
    <div
      ref={wrapRef}
      className="relative size-full select-none overflow-hidden bg-[#1a1712]"
    >
      <canvas
        ref={canvasRef}
        onClick={onCanvasClick}
        className="absolute inset-0 size-full cursor-pointer"
        style={{ imageRendering: "pixelated" }}
        aria-label="Escritório virtual — use WASD ou clique para andar"
      />

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
