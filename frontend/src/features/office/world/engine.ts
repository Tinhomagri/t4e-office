// Motor do Escritório: game loop de passo fixo, câmera, colisão, partículas,
// iluminação e ordenação por profundidade. Canvas 2D puro, um único canvas.
//
// Decisões que sustentam os 60fps:
// • Piso e paredes são assados UMA vez num canvas offscreen do tamanho do mapa;
//   por frame é um único drawImage recortado pela viewport.
// • Props e avatares viram sprites offscreen; o frame só faz blit.
// • A camada de luz é renderizada num buffer em baixa resolução e esticada —
//   gradiente radial por frame em resolução cheia custaria caro.
// • Nada é alocado dentro do loop: partículas vivem num pool fixo.
import { buildAvatarSheet } from "@/features/avatar/chibi"
import { ANIM_FPS, ANIMS, FH, FW, type AvatarConfig, type Direction } from "@/features/avatar/avatar.types"

import { type OfficeMap, type Seat, isSolid, zoneAt } from "./map"
import { PROPS, buildPropSprites, buildShadowSprite, type PropSprite } from "./props"
import {
  cameraTarget, focusScale, integerScale, offsetCamera, screenToWorld, viewOffsetFor, viewportFor,
} from "./camera"
import { keyAction } from "./input"
import { isoToWorld, worldToIso } from "./iso"
import { buildIsoGround } from "./isoBake"
import { SKY_PARALLAX, type SkyLayers, buildSky, cloudOffset, layerRect } from "./sky"
import { TILE, buildTileAtlas } from "./tiles"
import { makeCanvas } from "./pixels"
import { pokerBadgeFor } from "./poker-badge"

const STEP = 1 / 60
const WALK_SPEED = 46 // px/s — ~3 tiles por segundo, ritmo de Stardew
const RUN_SPEED = 82
/** Raio do corpo usado na colisão: o avatar ocupa menos que o tile inteiro. */
const BODY_R = 4

export interface Actor {
  id: string
  name: string
  config: AvatarConfig
  x: number
  y: number
  /** Alvo de interpolação para atores remotos. */
  tx: number
  ty: number
  facing: Direction
  anim: string
  frame: number
  frameTime: number
  self: boolean
  status: string
  /** Balão de fala com validade. */
  say: string
  sayUntil: number
  emote: string
  emoteUntil: number
  /** Voto atual na sessão de Planning Poker do andar 2; null = não votou. */
  pokerVote: string | null
  pokerRevealed: boolean
  sheet: HTMLCanvasElement
  sheetKey: string
  frames: Record<string, { x: number; y: number }[]>
  seatIndex: number
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
  color: string
  kind: number
}

const POOL = 240

export interface EngineCallbacks {
  onZoneChange?(zoneId: string | null, label: string, hint: string): void
  onMove?(x: number, y: number, facing: Direction): void
  /** Assento ao sentar, `null` ao levantar. */
  onInteract?(seat: Seat | null): void
}

export class OfficeEngine {
  readonly map: OfficeMap
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private ground!: HTMLCanvasElement
  /** Deslocamento a somar em `worldToIso(x, y)` para cair dentro de `ground`. */
  private isoOriginX = 0
  private isoOriginY = 0
  private lightBuf: HTMLCanvasElement
  private lightCtx: CanvasRenderingContext2D
  private props: Record<string, PropSprite>
  private shadow: PropSprite
  private sky: SkyLayers
  /** Offset ativo da câmera (apoiado no guarda-corpo). */
  private viewOffset = { dx: 0, dy: 0 }

  private actors = new Map<string, Actor>()
  private me: Actor | null = null

  private particles: Particle[] = []
  private alive = 0

  private keys = new Set<string>()
  private target: { x: number; y: number } | null = null

  private raf = 0
  private acc = 0
  private last = 0
  private time = 0
  private running = false

  /** Escala inteira de exibição (3 ou 4). Nunca fracionária. */
  scale = 3
  camX = 0
  camY = 0
  private viewW = 0
  private viewH = 0

  /** Ponto travado da câmera enquanto o PC está aberto. */
  private focus: { x: number; y: number; zoom: number } | null = null
  private cssW = 320
  private cssH = 200

  private currentZone: string | null = null
  private cb: EngineCallbacks
  private moveAccum = 0
  private reduceMotion = false

  /** Desligado enquanto o PC do escritório está aberto. */
  private inputEnabled = true

  /** Assento da própria mesa (ver `desk.ts`) — só pra desenhar a
   * seta indicativa acima dela. Não afeta física nem interação. */
  private myDeskSeatId: string | null = null

  /** Rótulos "de quem é a mesa" — vêm do backend (DeskAssignment), visíveis
   * pra QUALQUER pessoa, não só a dona da mesa (diferente da seta acima). */
  private deskLabels: { seatId: string; name: string }[] = []

  /** 0..1 — 0 = madrugada, 0.5 = meio-dia. Deriva do relógio real. */
  dayPhase = 0.5

  constructor(canvas: HTMLCanvasElement, map: OfficeMap, cb: EngineCallbacks = {}) {
    this.canvas = canvas
    this.map = map
    this.cb = cb
    this.ctx = canvas.getContext("2d", { alpha: false })!
    this.ctx.imageSmoothingEnabled = false

    this.props = buildPropSprites()
    this.shadow = buildShadowSprite()
    this.sky = buildSky()
    this.bakeGround()

    // Buffer de luz em 1/4 da resolução do mundo visível: o desfoque natural
    // do upscale vira o "falloff" suave das lâmpadas, de graça.
    const lb = makeCanvas(320, 200)
    this.lightBuf = lb.canvas
    this.lightCtx = lb.ctx

    this.particles = Array.from({ length: POOL }, () => ({
      x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0, size: 1, color: "#fff", kind: 0,
    }))

    this.reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    this.updateDayPhase()
  }

  // ── Construção estática ───────────────────────────────────────────────────

  /**
   * Assa piso + paredes num raster ISOMÉTRICO. Roda uma vez por troca de
   * andar. O piso vira losango e a parede vira bloco extrudado (2 faces +
   * tampa) — a projeção mora em `isoBake.ts`; aqui só delega e guarda a
   * origem para a câmera/clique converterem depois. Ver MASTER.md.
   */
  private bakeGround(): void {
    const atlas = buildTileAtlas()
    const iso = buildIsoGround(this.map, atlas)
    this.ground = iso.canvas
    this.isoOriginX = iso.originX
    this.isoOriginY = iso.originY
  }

  /** Projeta um ponto do mundo cartesiano para o espaço do raster iso assado. */
  private toIso(x: number, y: number): { x: number; y: number } {
    const p = worldToIso(x, y)
    return { x: p.x + this.isoOriginX, y: p.y + this.isoOriginY }
  }

  // ── Atores ────────────────────────────────────────────────────────────────

  private makeActor(
    id: string,
    name: string,
    config: AvatarConfig,
    x: number,
    y: number,
    self: boolean,
    status: string,
  ): Actor {
    const sheet = buildAvatarSheet(config)
    return {
      id, name, config, x, y, tx: x, ty: y,
      facing: "down", anim: "idle", frame: 0, frameTime: 0,
      self, status, say: "", sayUntil: 0, emote: "", emoteUntil: 0,
      pokerVote: null, pokerRevealed: false,
      sheet: sheet.canvas, sheetKey: JSON.stringify(config), frames: sheet.frames,
      seatIndex: -1,
    }
  }

  spawnSelf(id: string, name: string, config: AvatarConfig, x?: number, y?: number): Actor {
    const actor = this.makeActor(
      id, name, config,
      x ?? this.map.spawn.x,
      y ?? this.map.spawn.y,
      true,
      "available",
    )
    this.actors.set(id, actor)
    this.me = actor
    return actor
  }

  /** Reconcilia a lista de presença com os atores da cena. */
  syncRemote(
    members: { user_id: string; name: string; x: number; y: number; facing: Direction; status: string; avatar_config: AvatarConfig | null }[],
  ): void {
    const seen = new Set<string>()
    for (const m of members) {
      if (!m.avatar_config) continue
      if (this.me && m.user_id === this.me.id) continue
      seen.add(m.user_id)
      const wx = m.x * this.map.width
      const wy = m.y * this.map.height
      const existing = this.actors.get(m.user_id)
      if (!existing) {
        const actor = this.makeActor(m.user_id, m.name, m.avatar_config, wx, wy, false, m.status)
        this.actors.set(m.user_id, actor)
        continue
      }
      // Só o alvo muda: a posição real persegue o alvo no update (interpolação).
      existing.tx = wx
      existing.ty = wy
      existing.status = m.status
      existing.name = m.name
      const key = JSON.stringify(m.avatar_config)
      if (key !== existing.sheetKey) {
        const sheet = buildAvatarSheet(m.avatar_config)
        existing.sheet = sheet.canvas
        existing.frames = sheet.frames
        existing.sheetKey = key
      }
    }
    for (const [id, actor] of this.actors) {
      if (!actor.self && !seen.has(id)) this.actors.delete(id)
    }
  }

  /** Leitura para o HUD (minimapa). Não usar dentro do loop de render. */
  actorList(): Actor[] {
    return [...this.actors.values()]
  }

  updateSelfConfig(config: AvatarConfig): void {
    if (!this.me) return
    const key = JSON.stringify(config)
    if (key === this.me.sheetKey) return
    const sheet = buildAvatarSheet(config)
    this.me.sheet = sheet.canvas
    this.me.frames = sheet.frames
    this.me.sheetKey = key
    this.me.config = config
  }

  say(text: string): void {
    if (!this.me) return
    this.me.say = text.slice(0, 90)
    this.me.sayUntil = this.time + 5
  }

  emote(anim: string): void {
    if (!this.me) return
    this.me.emote = anim
    this.me.emoteUntil = this.time + 2.2
    this.target = null
  }

  /**
   * Estado de voto de todos os atores da sessão de poker ativa — a decisão
   * de QUEM votou o quê já veio pronta do React (que conversa com o
   * backend); aqui só reflete no desenho. `votes` é indexado por `actor.id`
   * (mesmo id de `spawnSelf`/`syncRemote`, que é o `user_id`).
   */
  setPokerVotes(votes: Map<string, string | null>, revealed: boolean): void {
    for (const actor of this.actors.values()) {
      actor.pokerVote = votes.get(actor.id) ?? null
      actor.pokerRevealed = revealed
    }
  }

  /** Marca qual assento é o da própria mesa — desenha uma seta em cima dela.
   * `null` some com a seta (ex.: andar sem baias, como o de poker). */
  setMyDesk(seatId: string | null): void {
    this.myDeskSeatId = seatId
  }

  /** Rótulos com nome acima de cada mesa atribuída — vindos do backend,
   * visíveis pra todo mundo (a seta de `setMyDesk` só o dono vê). */
  setDeskLabels(labels: { seatId: string; name: string }[]): void {
    this.deskLabels = labels
  }

  // ── Entrada ───────────────────────────────────────────────────────────────

  /** Liga/desliga o teclado do mapa (o PC do escritório desliga ao abrir). */
  setInputEnabled(enabled: boolean): void {
    this.inputEnabled = enabled
    if (!enabled) this.keys.clear()
  }

  onKeyDown = (e: KeyboardEvent): void => {
    const action = keyAction(e.key, this.inputEnabled)
    if (action === "move") {
      this.keys.add(e.key.toLowerCase())
      this.target = null
      e.preventDefault()
    }
    if (action === "interact") this.tryInteract()
  }

  onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.key.toLowerCase())
  }

  /** Clique na tela → alvo de caminhada no mundo (passa pela inversa iso). */
  clickTo(screenX: number, screenY: number): void {
    const iso = screenToWorld(this.camX, this.camY, this.scale, screenX, screenY)
    const { x, y } = isoToWorld(iso.x - this.isoOriginX, iso.y - this.isoOriginY)
    if (isSolid(this.map, x, y)) return
    this.target = { x, y }
    if (this.me) this.me.seatIndex = -1
  }

  /** O avatar do usuário está sentado? */
  isSeated(): boolean {
    return (this.me?.seatIndex ?? -1) >= 0
  }

  /** Senta na cadeira mais próxima (ou levanta, se já sentado). */
  tryInteract(): void {
    const me = this.me
    if (!me) return
    if (me.seatIndex >= 0) {
      me.seatIndex = -1
      me.anim = "idle"
      this.viewOffset = { dx: 0, dy: 0 }
      this.cb.onInteract?.(null)
      return
    }
    let best = -1
    let bestDist = 26
    this.map.seats.forEach((seat, i) => {
      const taken = [...this.actors.values()].some((a) => a !== me && a.seatIndex === i)
      if (taken) return
      const d = Math.hypot(seat.x - me.x, seat.y - me.y)
      if (d < bestDist) {
        bestDist = d
        best = i
      }
    })
    if (best < 0) {
      // Nenhum assento por perto: ainda assim avisa o React com "sem
      // assento" — é o que deixa interações de zona sem assento (elevador,
      // console do poker) funcionarem. Sem isso, apertar E de pé fora de
      // qualquer assento nunca chegava ao onInteract e a zona nunca reagia.
      this.cb.onInteract?.(null)
      return
    }
    const seat = this.map.seats[best]
    me.seatIndex = best
    me.x = seat.x
    me.y = seat.y
    me.facing = seat.facing
    me.anim =
      seat.kind === "view"
        ? "lean"
        : seat.kind === "lounge" || seat.kind === "poker"
          ? "idle"
          : "type"
    this.viewOffset =
      seat.kind === "view" ? viewOffsetFor(seat.facing) : { dx: 0, dy: 0 }
    this.target = null
    this.cb.onInteract?.(seat)
  }

  // ── Física ────────────────────────────────────────────────────────────────

  /**
   * Move com deslize: tenta os eixos separadamente para que esbarrar numa
   * parede diagonal escorregue em vez de travar.
   */
  private moveWithCollision(actor: Actor, dx: number, dy: number): void {
    if (dx !== 0) {
      const nx = actor.x + dx
      const edge = nx + Math.sign(dx) * BODY_R
      if (!isSolid(this.map, edge, actor.y - 2) && !isSolid(this.map, edge, actor.y - 6)) {
        actor.x = nx
      }
    }
    if (dy !== 0) {
      const ny = actor.y + dy
      const edge = ny + (dy > 0 ? 0 : -8)
      if (!isSolid(this.map, actor.x - BODY_R, edge) && !isSolid(this.map, actor.x + BODY_R, edge)) {
        actor.y = ny
      }
    }
    actor.x = Math.max(TILE, Math.min(this.map.width - TILE, actor.x))
    actor.y = Math.max(TILE * 2, Math.min(this.map.height - TILE, actor.y))
  }

  private updateSelf(dt: number): void {
    const me = this.me
    if (!me) return

    if (this.time < me.emoteUntil) {
      me.anim = me.emote
      return
    }
    if (me.seatIndex >= 0) return

    // Checagem de zona roda todo frame, parado ou andando — antes só rodava
    // dentro do bloco de movimento, então quem chegava a uma zona e ficava
    // parado sem antes se mexer (ex.: spawn dentro da própria zona) nunca
    // disparava onZoneChange, e o E não fazia nada.
    const zone = zoneAt(this.map, me.x, me.y)
    const zoneId = zone?.id ?? null
    if (zoneId !== this.currentZone) {
      this.currentZone = zoneId
      this.cb.onZoneChange?.(zoneId, zone?.label ?? "", zone?.hint ?? "")
      if (zone) {
        for (let i = 0; i < 8; i++) this.spawn(me.x, me.y - 10, 1)
      }
    }

    let dx = 0
    let dy = 0
    if (this.keys.has("w") || this.keys.has("arrowup")) dy -= 1
    if (this.keys.has("s") || this.keys.has("arrowdown")) dy += 1
    if (this.keys.has("a") || this.keys.has("arrowleft")) dx -= 1
    if (this.keys.has("d") || this.keys.has("arrowright")) dx += 1

    const running = this.keys.has("shift")
    let speed = running ? RUN_SPEED : WALK_SPEED

    if (dx === 0 && dy === 0 && this.target) {
      // Caminhada por clique: segue o vetor até chegar perto do alvo.
      const tdx = this.target.x - me.x
      const tdy = this.target.y - me.y
      const dist = Math.hypot(tdx, tdy)
      if (dist < 2) {
        this.target = null
      } else {
        dx = tdx / dist
        dy = tdy / dist
      }
    } else if (dx !== 0 || dy !== 0) {
      const len = Math.hypot(dx, dy) || 1
      dx /= len
      dy /= len
    }

    if (dx === 0 && dy === 0) {
      me.anim = "idle"
      return
    }

    // Direção pelo eixo dominante — 4 direções, como no sprite.
    if (Math.abs(dx) >= Math.abs(dy)) me.facing = dx > 0 ? "right" : "left"
    else me.facing = dy > 0 ? "down" : "up"
    me.anim = running ? "run" : "walk"

    const before = { x: me.x, y: me.y }
    this.moveWithCollision(me, dx * speed * dt, dy * speed * dt)

    // Poeirinha ao correr — só quando realmente saiu do lugar.
    if (running && Math.hypot(me.x - before.x, me.y - before.y) > 0.4 && Math.random() < 0.25) {
      this.spawn(me.x + (Math.random() - 0.5) * 4, me.y - 1, 2)
    }

    // Heartbeat: no máximo 5×/s, e só enquanto anda.
    this.moveAccum += dt
    if (this.moveAccum > 0.2) {
      this.moveAccum = 0
      this.cb.onMove?.(me.x / this.map.width, me.y / this.map.height, me.facing)
    }
  }

  private updateRemotes(dt: number): void {
    for (const actor of this.actors.values()) {
      if (actor.self) continue
      const dx = actor.tx - actor.x
      const dy = actor.ty - actor.y
      const dist = Math.hypot(dx, dy)
      if (dist < 0.5) {
        actor.x = actor.tx
        actor.y = actor.ty
        actor.anim = "idle"
        continue
      }
      // Teleporta se a diferença for absurda (voltou de aba em background).
      if (dist > 200) {
        actor.x = actor.tx
        actor.y = actor.ty
        continue
      }
      // Persegue o alvo com velocidade proporcional: chega suave, sem overshoot.
      const step = Math.min(dist, Math.max(WALK_SPEED, dist * 3) * dt)
      actor.x += (dx / dist) * step
      actor.y += (dy / dist) * step
      actor.anim = "walk"
      if (Math.abs(dx) >= Math.abs(dy)) actor.facing = dx > 0 ? "right" : "left"
      else actor.facing = dy > 0 ? "down" : "up"
    }
  }

  private updateAnim(dt: number): void {
    for (const actor of this.actors.values()) {
      const fps = ANIM_FPS[actor.anim] ?? 6
      const total = ANIMS[actor.anim] ?? 4
      actor.frameTime += dt
      if (actor.frameTime >= 1 / fps) {
        actor.frameTime = 0
        actor.frame = (actor.frame + 1) % total
      }
      if (actor.say && this.time > actor.sayUntil) actor.say = ""
    }
  }

  // ── Partículas ────────────────────────────────────────────────────────────

  /** kind: 0 = vapor, 1 = brilho de zona, 2 = poeira, 3 = poeira suspensa. */
  private spawn(x: number, y: number, kind: number): void {
    if (this.alive >= POOL) return
    const p = this.particles[this.alive++]
    p.x = x
    p.y = y
    p.kind = kind
    if (kind === 0) {
      p.vx = (Math.random() - 0.5) * 3
      p.vy = -8 - Math.random() * 6
      p.maxLife = 1.6 + Math.random()
      p.size = 1
      p.color = "#e8e2d8"
    } else if (kind === 1) {
      const a = Math.random() * Math.PI * 2
      p.vx = Math.cos(a) * 14
      p.vy = Math.sin(a) * 14 - 6
      p.maxLife = 0.7
      p.size = 1
      p.color = "#ffe6a8"
    } else if (kind === 2) {
      p.vx = (Math.random() - 0.5) * 8
      p.vy = -3 - Math.random() * 4
      p.maxLife = 0.45
      p.size = 1
      p.color = "#c9bda8"
    } else {
      p.vx = (Math.random() - 0.5) * 2
      p.vy = -1 - Math.random()
      p.maxLife = 6 + Math.random() * 4
      p.size = 1
      p.color = "#fff2d0"
    }
    p.life = 0
  }

  private updateParticles(dt: number): void {
    for (let i = this.alive - 1; i >= 0; i--) {
      const p = this.particles[i]
      p.x += p.vx * dt
      p.y += p.vy * dt
      if (p.kind === 0) p.vx += Math.sin((this.time + i) * 2) * 4 * dt // vapor serpenteia
      p.life += dt
      if (p.life >= p.maxLife) {
        // Troca com o último vivo e encolhe — sem splice, sem GC.
        this.particles[i] = this.particles[--this.alive]
        this.particles[this.alive] = p
      }
    }
  }

  // ── Ciclo dia/noite ───────────────────────────────────────────────────────

  private updateDayPhase(): void {
    const now = new Date()
    const h = now.getHours() + now.getMinutes() / 60
    // 6h → amanhecer, 12h → pico, 18h → entardecer, 22h+ → noite.
    this.dayPhase = Math.max(0, Math.min(1, (h - 5) / 14))
  }

  // ── Loop ──────────────────────────────────────────────────────────────────

  start(): void {
    if (this.running) return
    this.running = true
    this.last = performance.now()
    const loop = (t: number) => {
      const frameDt = Math.min((t - this.last) / 1000, 0.25)
      this.last = t
      this.acc += frameDt
      // Passo fixo: a física não muda de comportamento com o FPS da máquina.
      while (this.acc >= STEP) {
        this.time += STEP
        this.updateSelf(STEP)
        this.updateRemotes(STEP)
        this.updateAnim(STEP)
        this.updateParticles(STEP)
        this.acc -= STEP
      }
      this.emitAmbient()
      this.render()
      this.raf = requestAnimationFrame(loop)
    }
    this.raf = requestAnimationFrame(loop)
  }

  stop(): void {
    this.running = false
    cancelAnimationFrame(this.raf)
  }

  private ambientAccum = 0
  private emitAmbient(): void {
    if (this.reduceMotion) return
    this.ambientAccum += STEP
    if (this.ambientAccum < 0.35) return
    this.ambientAccum = 0
    // Vapor da cafeteira.
    this.spawn(38 * TILE + 8, 4 * TILE + 14, 0)
    // Poeira iluminada pela janela, só de dia.
    if (this.dayPhase > 0.25 && this.dayPhase < 0.85 && Math.random() < 0.5) {
      this.spawn(10 * TILE + Math.random() * 200, 6 * TILE + Math.random() * 60, 3)
    }
  }

  resize(cssW: number, cssH: number): void {
    this.cssW = cssW
    this.cssH = cssH
    const dpr = Math.max(1, Math.round(window.devicePixelRatio || 1))
    this.canvas.width = cssW * dpr
    this.canvas.height = cssH * dpr
    this.canvas.style.width = `${cssW}px`
    this.canvas.style.height = `${cssH}px`
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    this.ctx.imageSmoothingEnabled = false
    this.applyScale()
  }

  /** Recalcula escala e viewport. Escala inteira, sempre. */
  private applyScale(): void {
    this.scale = this.focus
      ? focusScale(this.cssW, this.cssH, this.focus.zoom)
      : integerScale(this.cssW, this.cssH)
    const { viewW, viewH } = viewportFor(this.cssW, this.cssH, this.scale)
    this.viewW = viewW
    this.viewH = viewH
    this.lightBuf.width = Math.max(1, Math.ceil(this.viewW / 2))
    this.lightBuf.height = Math.max(1, Math.ceil(this.viewH / 2))
  }

  /**
   * Trava a câmera num ponto do mundo com zoom. `zoom` é piso, não alvo exato:
   * `focusScale` mantém a escala inteira e dentro do teto. `x, y` chegam em
   * coordenadas de mundo cartesiano (ex.: `seat.x/y`) — guarda já projetado,
   * porque `updateCamera` trabalha inteiramente em espaço iso.
   */
  focusOn(x: number, y: number, zoom = 6): void {
    const iso = this.toIso(x, y)
    this.focus = { x: iso.x, y: iso.y, zoom }
    this.applyScale()
  }

  clearFocus(): void {
    this.focus = null
    this.applyScale()
  }

  private updateCamera(): void {
    // `focus` já chega projetado (ver `focusOn`); `me` é cartesiano e precisa
    // passar pela projeção iso antes de virar alvo de câmera.
    const anchor = this.focus ?? (this.me ? this.toIso(this.me.x, this.me.y) : null)
    if (!anchor) return
    const groundW = this.ground.width
    const groundH = this.ground.height
    const base = cameraTarget(anchor.x, anchor.y, this.viewW, this.viewH, groundW, groundH)
    const { x: cx, y: cy } = offsetCamera(
      base, this.viewOffset.dx, this.viewOffset.dy, this.viewW, this.viewH, groundW, groundH,
    )
    const ease = this.reduceMotion ? 1 : 0.14
    this.camX += (cx - this.camX) * ease
    this.camY += (cy - this.camY) * ease
    // Arredondar a câmera para inteiro é o que impede o mundo de tremer.
    this.camX = Math.round(this.camX * 2) / 2
    this.camY = Math.round(this.camY * 2) / 2
  }

  private render(): void {
    const ctx = this.ctx
    this.updateCamera()
    const camX = Math.round(this.camX)
    const camY = Math.round(this.camY)
    const s = this.scale

    // Céu primeiro: o piso é blitado por cima com alfa, então vidro,
    // guarda-corpo e o vazio fora do prédio revelam estas faixas.
    const vw = this.viewW
    const vh = this.viewH
    const blit = (layer: HTMLCanvasElement, factor: number, extraX = 0) => {
      const r = layerRect(factor, camX + extraX, camY, vw, vh)
      ctx.drawImage(layer, r.sx, r.sy, r.sw, r.sh, 0, 0, vw * s, vh * s)
      // Segunda passada quando o recorte cruza o fim da faixa — sem ela
      // aparece uma coluna vazia a cada volta do loop.
      const over = r.sx + r.sw - layer.width
      if (over > 0) {
        ctx.drawImage(
          layer, 0, r.sy, over, r.sh,
          (r.sw - over) * s, 0, over * s, vh * s,
        )
      }
    }

    blit(this.sky.sky, 0)
    blit(this.sky.far, SKY_PARALLAX.far)
    blit(this.sky.near, SKY_PARALLAX.near)
    ctx.drawImage(
      this.sky.clouds,
      cloudOffset(camX, this.time), 0, vw, vh,
      0, 0, vw * s, vh * s,
    )

    // Piso e paredes: um único blit da região visível.
    ctx.drawImage(
      this.ground,
      camX, camY, this.viewW, this.viewH,
      0, 0, this.viewW * s, this.viewH * s,
    )

    // Zonas: um brilho tênue no chão, sob tudo. Um retângulo em mundo
    // cartesiano vira PARALELOGRAMO na tela iso (transform linear) — desenha
    // como polígono de 4 pontos em vez de fillRect.
    for (const zone of this.map.zones) {
      const x0 = zone.x * TILE
      const y0 = zone.y * TILE
      const x1 = x0 + zone.w * TILE
      const y1 = y0 + zone.h * TILE
      const corners = [
        this.toIso(x0, y0), this.toIso(x1, y0), this.toIso(x1, y1), this.toIso(x0, y1),
      ].map((p) => ({ x: (p.x - camX) * s, y: (p.y - camY) * s }))
      const xs = corners.map((c) => c.x)
      const ys = corners.map((c) => c.y)
      if (Math.min(...xs) > vw * s || Math.min(...ys) > vh * s || Math.max(...xs) < 0 || Math.max(...ys) < 0) continue
      ctx.globalAlpha = zone.id === this.currentZone ? 0.14 : 0.05
      ctx.fillStyle = zone.accent
      ctx.beginPath()
      ctx.moveTo(corners[0].x, corners[0].y)
      for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i].x, corners[i].y)
      ctx.closePath()
      ctx.fill()
      ctx.globalAlpha = 1
    }

    // Ordenação por profundidade isométrica: chave = soma cartesiana x+y do
    // "pé" (quem está mais para baixo-direita no grid desenha por cima).
    type Drawable = { base: number; draw(): void }
    const queue: Drawable[] = []

    for (const p of this.map.props) {
      const def = PROPS[p.kind]
      const sprite = this.props[p.kind]
      if (!sprite) continue
      // O sprite já nasce projetado em iso (`isoProps.ts` — caixa com 3
      // faces, ou painel em pé pros presos na parede): aqui é só blit plano,
      // igual ator. `anchor` diz que ponto do canvas corresponde à posição
      // de mundo `p.x, p.y` (canto norte da pegada); sem `anchor`, cai no
      // canto superior-esquerdo do canvas (props antigos, ainda achatados).
      const iso = this.toIso(p.x, p.y)
      const anchor = def.anchor ?? { x: 0, y: 0 }
      const sx = (iso.x - camX) * s - anchor.x * s
      const sy = (iso.y - camY) * s - anchor.y * s
      if (sx > this.viewW * s || sy > this.viewH * s || sx + def.w * s < 0 || sy + def.h * s < 0) continue
      queue.push({
        base: p.x + p.y + (def.baseline ?? def.h),
        draw: () => ctx.drawImage(sprite.canvas, sx, sy, def.w * s, def.h * s),
      })
    }

    for (const actor of this.actors.values()) {
      const isoA = this.toIso(actor.x, actor.y)
      const sx = Math.round(isoA.x - FW / 2 - camX) * s
      const sy = Math.round(isoA.y - FH - camY) * s
      if (sx > this.viewW * s || sy > this.viewH * s || sx + FW * s < 0 || sy + FH * s < 0) continue
      const key = `${actor.facing}_${actor.anim}`
      const frames = actor.frames[key] ?? actor.frames[`down_${actor.anim}`] ?? actor.frames["down_idle"]
      const fr = frames[actor.frame % frames.length]
      queue.push({
        base: actor.x + actor.y,
        draw: () => {
          // Sombra de contato antes do corpo.
          ctx.drawImage(
            this.shadow.canvas,
            Math.round(isoA.x - this.shadow.w / 2 - camX) * s,
            Math.round(isoA.y - 3 - camY) * s,
            this.shadow.w * s,
            this.shadow.h * s,
          )
          ctx.drawImage(actor.sheet, fr.x, fr.y, FW, FH, sx, sy, FW * s, FH * s)
        },
      })
    }

    queue.sort((a, b) => a.base - b.base)
    for (const item of queue) item.draw()

    // Partículas por cima do mundo, abaixo da luz.
    for (let i = 0; i < this.alive; i++) {
      const p = this.particles[i]
      const t = p.life / p.maxLife
      const iso = this.toIso(p.x, p.y)
      ctx.globalAlpha = p.kind === 3 ? 0.35 * (1 - t) : 0.8 * (1 - t)
      ctx.fillStyle = p.color
      ctx.fillRect(
        Math.round(iso.x - camX) * s,
        Math.round(iso.y - camY) * s,
        p.size * s,
        p.size * s,
      )
    }
    ctx.globalAlpha = 1

    this.renderLighting(camX, camY, s)
    this.renderMyDeskArrow(camX, camY, s)
    this.renderDeskLabels(camX, camY, s)
    this.renderNameplates(camX, camY, s)
  }

  /** Seta dourada balançando em cima da própria mesa — só um indicador
   * visual, não afeta física nem quem senta onde. */
  private renderMyDeskArrow(camX: number, camY: number, s: number): void {
    if (!this.myDeskSeatId) return
    const seat = this.map.seats.find((st) => st.id === this.myDeskSeatId)
    if (!seat) return
    const iso = this.toIso(seat.x, seat.y)
    const bob = Math.sin(this.time * 3) * 3
    const sx = (iso.x - camX) * s
    const sy = (iso.y - camY) * s - 34 * s + bob * s
    if (sx < -40 || sy < -40 || sx > this.viewW * s + 40 || sy > this.viewH * s + 40) return

    const ctx = this.ctx
    ctx.save()
    ctx.fillStyle = "#f0c05a"
    ctx.strokeStyle = "#2b1e1a"
    ctx.lineWidth = 1
    const w = 6 * s
    const h = 8 * s
    ctx.beginPath()
    ctx.moveTo(sx, sy + h) // ponta, apontando pra baixo
    ctx.lineTo(sx - w, sy)
    ctx.lineTo(sx - w / 2, sy)
    ctx.lineTo(sx - w / 2, sy - h * 0.6)
    ctx.lineTo(sx + w / 2, sy - h * 0.6)
    ctx.lineTo(sx + w / 2, sy)
    ctx.lineTo(sx + w, sy)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.restore()
  }

  /** Nome de quem senta em cada mesa atribuída — pequeno, acima da mesa,
   * visível pra qualquer pessoa (não só a dona). */
  private renderDeskLabels(camX: number, camY: number, s: number): void {
    if (this.deskLabels.length === 0) return
    const ctx = this.ctx
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.font = "600 9px -apple-system, system-ui, sans-serif"
    for (const label of this.deskLabels) {
      const seat = this.map.seats.find((st) => st.id === label.seatId)
      if (!seat) continue
      const iso = this.toIso(seat.x, seat.y)
      const sx = (iso.x - camX) * s
      const sy = (iso.y - camY) * s - 26 * s
      if (sx < -60 || sy < -20 || sx > this.viewW * s + 60 || sy > this.viewH * s + 20) continue
      const tw = ctx.measureText(label.name).width
      const bw = tw + 10
      ctx.fillStyle = "rgba(23,27,33,0.7)"
      ctx.fillRect(sx - bw / 2, sy - 7, bw, 14)
      ctx.fillStyle = "#ffffff"
      ctx.fillText(label.name, sx, sy)
    }
  }

  /**
   * Camada de luz: um véu de cor por cima da cena (mais forte à noite),
   * furado pelas lâmpadas com gradiente radial em `destination-out`.
   */
  private renderLighting(camX: number, camY: number, s: number): void {
    const lc = this.lightCtx
    const lw = this.lightBuf.width
    const lh = this.lightBuf.height
    const half = 0.5 // buffer roda em metade da resolução da viewport

    // Curva do dia: azul frio de madrugada → neutro ao meio-dia → âmbar à noite.
    const phase = this.dayPhase
    const night = Math.max(0, 1 - Math.sin(Math.PI * phase) * 1.35)
    if (night <= 0.02) return

    lc.clearRect(0, 0, lw, lh)
    lc.globalCompositeOperation = "source-over"
    lc.fillStyle = phase < 0.5 ? "#1b2440" : "#3a2418"
    lc.globalAlpha = Math.min(0.62, night * 0.7)
    lc.fillRect(0, 0, lw, lh)
    lc.globalAlpha = 1

    lc.globalCompositeOperation = "destination-out"
    for (const light of this.map.lights) {
      const isoL = this.toIso(light.x, light.y)
      const lx = (isoL.x - camX) * half
      const ly = (isoL.y - camY) * half
      const r = light.radius * half
      if (lx + r < 0 || ly + r < 0 || lx - r > lw || ly - r > lh) continue
      const flick = light.flicker
        ? 1 + Math.sin(this.time * 9 + light.x) * light.flicker
        : 1
      const g = lc.createRadialGradient(lx, ly, 0, lx, ly, r * flick)
      g.addColorStop(0, "rgba(0,0,0,0.95)")
      g.addColorStop(0.55, "rgba(0,0,0,0.55)")
      g.addColorStop(1, "rgba(0,0,0,0)")
      lc.fillStyle = g
      lc.fillRect(lx - r, ly - r, r * 2, r * 2)
    }
    // O jogador carrega uma luz fraca — nunca fica no escuro absoluto.
    if (this.me) {
      const isoMe = this.toIso(this.me.x, this.me.y)
      const lx = (isoMe.x - camX) * half
      const ly = (isoMe.y - 12 - camY) * half
      const r = 46 * half
      const g = lc.createRadialGradient(lx, ly, 0, lx, ly, r)
      g.addColorStop(0, "rgba(0,0,0,0.6)")
      g.addColorStop(1, "rgba(0,0,0,0)")
      lc.fillStyle = g
      lc.fillRect(lx - r, ly - r, r * 2, r * 2)
    }
    lc.globalCompositeOperation = "source-over"

    this.ctx.imageSmoothingEnabled = true // o borrão aqui É o falloff da luz
    this.ctx.drawImage(this.lightBuf, 0, 0, this.viewW * s, this.viewH * s)
    this.ctx.imageSmoothingEnabled = false
  }

  /** Nomes, status e balões — texto nítido, fora da grade de pixels. */
  private renderNameplates(camX: number, camY: number, s: number): void {
    const ctx = this.ctx
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"

    for (const actor of this.actors.values()) {
      const isoA = this.toIso(actor.x, actor.y)
      const sx = (isoA.x - camX) * s
      const sy = (isoA.y - FH - camY) * s
      if (sx < -80 || sy < -80 || sx > this.viewW * s + 80 || sy > this.viewH * s + 80) continue

      if (actor.say) {
        const font = 11
        ctx.font = `${font}px -apple-system, system-ui, sans-serif`
        const w = Math.min(190, ctx.measureText(actor.say).width + 14)
        const bx = sx - w / 2
        const by = sy - 34
        ctx.fillStyle = "rgba(255,255,255,0.96)"
        ctx.strokeStyle = "rgba(43,30,26,0.5)"
        ctx.lineWidth = 1
        roundRect(ctx, bx, by, w, 20, 5)
        ctx.fill()
        ctx.stroke()
        // Rabicho do balão.
        ctx.beginPath()
        ctx.moveTo(sx - 4, by + 20)
        ctx.lineTo(sx, by + 25)
        ctx.lineTo(sx + 4, by + 20)
        ctx.closePath()
        ctx.fillStyle = "rgba(255,255,255,0.96)"
        ctx.fill()
        ctx.fillStyle = "#2b1e1a"
        ctx.fillText(actor.say, sx, by + 10, w - 10)
      }

      const label = actor.name
      ctx.font = "600 10px -apple-system, system-ui, sans-serif"
      const tw = ctx.measureText(label).width
      const pad = 12
      const bw = tw + pad + 8
      const bx = sx - bw / 2
      const by = sy - 14
      ctx.fillStyle = actor.self ? "rgba(12,102,228,0.92)" : "rgba(23,27,33,0.78)"
      roundRect(ctx, bx, by, bw, 13, 6)
      ctx.fill()
      ctx.fillStyle = STATUS_COLOR[actor.status] ?? "#8590A2"
      ctx.beginPath()
      ctx.arc(bx + 6, by + 6.5, 2.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = "#ffffff"
      ctx.fillText(label, sx + 4, by + 7)

      const badge = pokerBadgeFor(actor.pokerVote, actor.pokerRevealed)
      if (badge) {
        const bw2 = 18
        const bx2 = sx - bw2 / 2
        const by2 = by - 18
        ctx.fillStyle = badge.revealed ? "#6c5cf0" : "#2b2b3a"
        roundRect(ctx, bx2, by2, bw2, 16, 4)
        ctx.fill()
        ctx.strokeStyle = "rgba(255,255,255,0.4)"
        ctx.lineWidth = 1
        ctx.stroke()
        ctx.fillStyle = "#ffffff"
        ctx.font = "700 10px -apple-system, system-ui, sans-serif"
        ctx.fillText(badge.text, sx, by2 + 8)
      }
    }
  }
}

const STATUS_COLOR: Record<string, string> = {
  available: "#4BCE97",
  focus: "#F87168",
  meeting: "#FCA700",
  away: "#8590A2",
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}
