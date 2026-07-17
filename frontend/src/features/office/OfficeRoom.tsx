import { useEffect, useRef, useState } from "react"

import { AvatarCanvas } from "@/features/avatar/AvatarCanvas"
import type { AvatarConfig, Direction } from "@/features/avatar/avatar.types"
import { useAuthStore } from "@/features/auth/auth.store"
import { StatusDot } from "@/shared/ui/primitives"

import { useHeartbeat, useRoom } from "./office.hooks"
import type { OfficeMember } from "./office.types"
import { clamp01, facingFromDelta } from "./office.util"

const KEEPALIVE_MS = 3000

export function OfficeRoom({
  workspaceId,
  myConfig,
}: {
  workspaceId: string
  myConfig: AvatarConfig
}) {
  const me = useAuthStore((s) => s.user)
  const room = useRoom(workspaceId)
  const heartbeat = useHeartbeat()
  const boardRef = useRef<HTMLDivElement>(null)

  const [pos, setPos] = useState({ x: 0.5, y: 0.5 })
  const [facing, setFacing] = useState<Direction>("down")
  const [moving, setMoving] = useState(false)
  const [travelMs, setTravelMs] = useState(600)
  const inited = useRef(false)

  // Estado móvel lido pelo keepalive sem recriar o timer a cada passo.
  const live = useRef({ pos, facing })
  live.current = { pos, facing }

  // Posição inicial: retoma a do servidor se já existir.
  useEffect(() => {
    if (inited.current || !room.data) return
    const mine = room.data.find((m) => m.user_id === me?.id)
    if (mine) setPos({ x: mine.x, y: mine.y })
    inited.current = true
  }, [room.data, me?.id])

  // Heartbeat de keepalive (mantém presença viva mesmo parado).
  useEffect(() => {
    const send = () =>
      heartbeat.mutate({
        workspace_id: workspaceId,
        x: live.current.pos.x,
        y: live.current.pos.y,
        facing: live.current.facing,
      })
    send()
    const t = window.setInterval(send, KEEPALIVE_MS)
    return () => window.clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId])

  const walkTimer = useRef<number>()
  const moveTo = (e: React.MouseEvent) => {
    const rect = boardRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = clamp01((e.clientX - rect.left) / rect.width)
    const y = clamp01((e.clientY - rect.top) / rect.height)
    const dx = x - pos.x
    const dy = y - pos.y
    const dist = Math.hypot(dx, dy)
    if (dist < 0.01) return
    const dir = facingFromDelta(dx, dy)
    const ms = Math.round(Math.max(400, Math.min(2000, dist * 2200)))

    setTravelMs(ms)
    setFacing(dir)
    setMoving(true)
    setPos({ x, y })
    heartbeat.mutate({ workspace_id: workspaceId, x, y, facing: dir })

    window.clearTimeout(walkTimer.current)
    walkTimer.current = window.setTimeout(() => setMoving(false), ms)
  }

  const others = (room.data ?? []).filter((m) => m.user_id !== me?.id)

  return (
    <div
      ref={boardRef}
      onClick={moveTo}
      className="relative aspect-[16/10] w-full cursor-pointer overflow-hidden rounded-2xl border border-ink/10 dark:border-ink-700 select-none"
      style={{
        backgroundColor: "#e9e6dd",
        backgroundImage:
          "linear-gradient(rgba(0,0,0,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.05) 1px, transparent 1px)",
        backgroundSize: "6% 9.6%",
      }}
    >
      {/* Zonas decorativas (rótulos de contexto — não interativas no MVP). */}
      <ZoneLabel x={18} y={12} label="Foco" />
      <ZoneLabel x={82} y={12} label="Reunião" />
      <ZoneLabel x={50} y={88} label="Social" />

      {others.map((m) => (
        <AvatarSprite key={m.user_id} member={m} config={m.avatar_config} />
      ))}

      {/* Meu avatar — controlado localmente para movimento imediato. */}
      <AvatarSprite
        self
        member={{
          user_id: me?.id ?? "me",
          name: me?.full_name ?? "Você",
          x: pos.x,
          y: pos.y,
          facing,
          status: "available",
          avatar_config: myConfig,
        }}
        config={myConfig}
        anim={moving ? "walk" : "idle"}
        travelMs={travelMs}
      />
    </div>
  )
}

function ZoneLabel({ x, y, label }: { x: number; y: number; label: string }) {
  return (
    <span
      className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink/40"
      style={{ left: `${x}%`, top: `${y}%` }}
    >
      {label}
    </span>
  )
}

// Rastreia quando cada usuário se moveu pela última vez → anima "walk".
const lastMoved = new Map<string, { x: number; y: number; t: number }>()

function AvatarSprite({
  member,
  config,
  self = false,
  anim,
  travelMs = 1000,
}: {
  member: OfficeMember
  config: AvatarConfig | null
  self?: boolean
  anim?: string
  travelMs?: number
}) {
  // Detecta movimento (só para os outros; o próprio recebe anim explícita).
  let walking = false
  if (!self) {
    const prev = lastMoved.get(member.user_id)
    if (!prev || prev.x !== member.x || prev.y !== member.y) {
      lastMoved.set(member.user_id, { x: member.x, y: member.y, t: Date.now() })
      walking = !!prev // primeiro avistamento não anda
    } else {
      walking = Date.now() - prev.t < 1400
    }
  }
  const activeAnim = anim ?? (walking ? "walk" : "idle")

  if (!config) return null

  return (
    <div
      className="pointer-events-none absolute flex -translate-x-1/2 -translate-y-full flex-col items-center transition-[left,top] ease-linear"
      style={{
        left: `${member.x * 100}%`,
        top: `${member.y * 100}%`,
        transitionDuration: self ? `${travelMs}ms` : "1000ms",
        zIndex: Math.round(member.y * 1000),
      }}
    >
      <div className="mb-0.5 flex items-center gap-1 rounded-full bg-paper/90 dark:bg-ink-900/90 px-1.5 py-0.5 shadow-sm">
        <StatusDot status={member.status} />
        <span className="max-w-[90px] truncate text-[10px] font-medium text-ink dark:text-paper">
          {member.name}
        </span>
      </div>
      <AvatarCanvas config={config} anim={activeAnim} dir={member.facing} scale={3} />
    </div>
  )
}
