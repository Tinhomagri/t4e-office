import { useEffect, useRef } from "react"

// ─────────────────────────────────────────────────────────────────────────────
// Escritório Virtual 2D pixelado — a alma do Pulse, renderizado em Canvas.
// Mundo de design fixo (200×340, retrato) desenhado em pixel art e escalado em
// fator inteiro com suavização desligada → pixels crocantes. Tudo procedural,
// sem arquivos de sprite. Paleta 100% escala de cinza (P&B da marca).
//
// Interativo:
//  · avatares (pessoas) caminham entre mesas e salas, com status de presença
//  · proximidade gera balão de conversa (proximidade = conversa, §5.1 do doc)
//  · quadro Kanban com cards migrando de coluna (Tasks) + confete na conclusão
//  · hover destaca a pessoa e mostra no que ela trabalha; clique dispara kudos
// ─────────────────────────────────────────────────────────────────────────────

const W = 200 // largura lógica do mundo (pixels de arte)
const H = 340 // altura lógica do mundo

// Paleta monocromática
const C = {
  bg: "#0a0a0a",
  floorA: "#121212",
  floorB: "#171717",
  grid: "rgba(255,255,255,0.045)",
  wall: "#2a2a2a",
  wallTop: "#383838",
  deskTop: "#2e2e2e",
  deskLeg: "#1c1c1c",
  screen: "#e5e5e5",
  screenDim: "#9a9a9a",
  card: "#d4d4d4",
  cardDone: "#ffffff",
  label: "rgba(255,255,255,0.28)",
  plant: "#4a4a4a",
} as const

// Tons de corpo (cada pessoa distinta em escala de cinza)
const BODY = ["#8a8a8a", "#a3a3a3", "#bdbdbd", "#737373", "#cfcfcf", "#979797"]

type Status = "available" | "focus" | "meeting"
const STATUS_SHADE: Record<Status, string> = {
  available: "#ffffff",
  focus: "#6e6e6e",
  meeting: "#b0b0b0",
}

interface Waypoint {
  x: number
  y: number
}

interface Avatar {
  x: number
  y: number
  tx: number
  ty: number
  speed: number
  body: string
  status: Status
  name: string
  card: string
  sitT: number // tempo restante "sentado/parado"
  phase: number // fase do balanço da caminhada
  hop: number // animação de clique (kudos)
}

interface TaskCard {
  col: number // 0,1,2
  slot: number
  t: number // 0..1 progresso de transição entre colunas
  moving: boolean
  wait: number
}

interface Reaction {
  x: number
  y: number
  life: number
  kind: "kudos" | "ping"
}

const NAMES = ["Bruno", "Carla", "Ana", "Téo", "Rui", "Lia", "Igor", "Nat"]
const CARDS = ["MIA-142", "TEF-09", "MIA-133", "MIA-151", "TEF-04", "MIA-120"]

// Pontos de interesse onde os avatares param (mesas, salas, copa)
const SEATS: Waypoint[] = [
  // sala de reunião (topo-direita)
  { x: 150, y: 38 },
  { x: 170, y: 38 },
  { x: 160, y: 55 },
  // sala de foco (topo-esquerda)
  { x: 35, y: 40 },
  // mesas Produto
  { x: 40, y: 150 },
  { x: 70, y: 150 },
  { x: 40, y: 185 },
  { x: 70, y: 185 },
  // mesas CX
  { x: 40, y: 250 },
  { x: 70, y: 250 },
  // copa / social (rodapé)
  { x: 130, y: 305 },
  { x: 155, y: 305 },
  { x: 100, y: 300 },
]

export function Scene() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Buffer lógico de baixa resolução; depois blitamos escalado (pixel art)
    const buf = document.createElement("canvas")
    buf.width = W
    buf.height = H
    const b = buf.getContext("2d")!
    b.imageSmoothingEnabled = false

    // ── Estado do mundo ──
    const avatars: Avatar[] = Array.from({ length: 7 }, (_, i) => {
      const s = SEATS[i % SEATS.length]
      const statuses: Status[] = ["available", "focus", "meeting", "available"]
      return {
        x: s.x,
        y: s.y,
        tx: s.x,
        ty: s.y,
        speed: 14 + Math.random() * 10,
        body: BODY[i % BODY.length],
        status: statuses[i % statuses.length],
        name: NAMES[i % NAMES.length],
        card: CARDS[i % CARDS.length],
        sitT: 1 + Math.random() * 4,
        phase: Math.random() * Math.PI * 2,
        hop: 0,
      }
    })

    const tasks: TaskCard[] = Array.from({ length: 5 }, (_, i) => ({
      col: i % 3,
      slot: Math.floor(i / 3),
      t: 0,
      moving: false,
      wait: 1 + Math.random() * 4,
    }))

    const reactions: Reaction[] = []

    // Mouse em coordenadas lógicas + estado de hover
    const mouse = { x: -1, y: -1, inside: false }
    let scale = 1
    let offX = 0
    let offY = 0
    let hovered = -1

    // ── Layout responsivo: fator inteiro de cobertura, centralizado ──
    function resize() {
      const parent = canvas!.parentElement!
      const cw = parent.clientWidth
      const ch = parent.clientHeight
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas!.width = Math.floor(cw * dpr)
      canvas!.height = Math.floor(ch * dpr)
      canvas!.style.width = cw + "px"
      canvas!.style.height = ch + "px"
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx!.imageSmoothingEnabled = false
      scale = Math.ceil(Math.max(cw / W, ch / H)) // cobre o painel
      offX = Math.round((cw - W * scale) / 2)
      offY = Math.round((ch - H * scale) / 2)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas.parentElement!)

    // ── Eventos de ponteiro ──
    function toLogical(e: PointerEvent) {
      const r = canvas!.getBoundingClientRect()
      mouse.x = (e.clientX - r.left - offX) / scale
      mouse.y = (e.clientY - r.top - offY) / scale
    }
    const onMove = (e: PointerEvent) => {
      toLogical(e)
      mouse.inside = true
    }
    const onLeave = () => {
      mouse.inside = false
      mouse.x = mouse.y = -1
    }
    const onClick = (e: PointerEvent) => {
      toLogical(e)
      if (hovered >= 0) {
        const a = avatars[hovered]
        a.hop = 1
        reactions.push({ x: a.x, y: a.y - 14, life: 1, kind: "kudos" })
      }
    }
    canvas.addEventListener("pointermove", onMove)
    canvas.addEventListener("pointerleave", onLeave)
    canvas.addEventListener("pointerdown", onClick)

    // ── Helpers de desenho (coords lógicas) ──
    const px = (x: number, y: number, w: number, h: number, color: string) => {
      b.fillStyle = color
      b.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h))
    }

    function drawFloor() {
      px(0, 0, W, H, C.bg)
      const tile = 20
      for (let yy = 0; yy < H; yy += tile) {
        for (let xx = 0; xx < W; xx += tile) {
          const odd = ((xx / tile) + (yy / tile)) % 2 === 0
          px(xx, yy, tile, tile, odd ? C.floorA : C.floorB)
        }
      }
      // Linhas de grade finas (eco do motivo gráfico do app)
      b.fillStyle = C.grid
      for (let xx = 0; xx <= W; xx += tile) b.fillRect(xx, 0, 1, H)
      for (let yy = 0; yy <= H; yy += tile) b.fillRect(0, yy, W, 1)
    }

    // Sala com parede + rótulo
    function drawRoom(x: number, y: number, w: number, h: number, label: string) {
      px(x, y, w, h, "rgba(255,255,255,0.02)")
      // moldura tipo parede pixelada
      px(x, y, w, 3, C.wallTop)
      px(x, y + h - 2, w, 2, C.wall)
      px(x, y, 2, h, C.wall)
      px(x + w - 2, y, 2, h, C.wall)
      drawLabel(label, x + 4, y + 9)
    }

    function drawLabel(text: string, x: number, y: number) {
      b.font = "7px monospace"
      b.fillStyle = C.label
      b.textBaseline = "alphabetic"
      b.fillText(text.toUpperCase(), Math.round(x), Math.round(y))
    }

    // Mesa com monitor (pequeno glow na tela)
    function drawDesk(x: number, y: number) {
      px(x, y + 8, 22, 4, C.deskLeg) // sombra/frente
      px(x, y, 22, 9, C.deskTop) // tampo
      px(x + 7, y + 1, 8, 5, C.screenDim) // monitor
      px(x + 8, y + 2, 6, 3, C.screen) // tela acesa
    }

    function drawPlant(x: number, y: number) {
      px(x + 1, y + 4, 4, 3, "#2a2a2a") // vaso
      px(x, y, 6, 5, C.plant) // folhagem
      px(x + 2, y - 1, 2, 2, C.plant)
    }

    // Quadro Kanban (Tasks) — 3 colunas com cards
    const BOARD = { x: 120, y: 150, w: 70, h: 96 }
    function drawBoard() {
      const { x, y, w, h } = BOARD
      px(x - 2, y - 2, w + 4, h + 4, C.wall)
      px(x, y, w, h, "#101010")
      drawLabel("Tasks", x + 3, y + 10)
      const colW = w / 3
      for (let c = 1; c < 3; c++) px(x + c * colW, y + 14, 1, h - 16, "rgba(255,255,255,0.08)")
      // cabeçalhos de coluna
      for (let c = 0; c < 3; c++) px(x + c * colW + 3, y + 14, colW - 6, 1, "rgba(255,255,255,0.15)")

      for (const t of tasks) {
        const colW = w / 3
        const baseX = x + t.col * colW + 4
        const nextX = x + ((t.col + 1) % 3) * colW + 4
        const cx = t.moving ? baseX + (nextX - baseX) * easeInOut(t.t) : baseX
        const cy = y + 20 + t.slot * 11
        const done = t.col === 2
        px(cx, cy, colW - 8, 8, done ? C.cardDone : C.card)
        px(cx + 1, cy + 2, colW - 12, 1, "rgba(0,0,0,0.25)") // "texto" do card
        px(cx + 1, cy + 4, colW - 14, 1, "rgba(0,0,0,0.18)")
      }
    }

    // Avatar pixel (≈7×12) com balanço de caminhada e status
    function drawAvatar(a: Avatar, highlight: boolean) {
      const moving = Math.abs(a.x - a.tx) > 0.5 || Math.abs(a.y - a.ty) > 0.5
      const bob = moving ? Math.round(Math.sin(a.phase) * 1) : 0
      const hopY = a.hop > 0 ? -Math.round(Math.sin((1 - a.hop) * Math.PI) * 3) : 0
      const ox = Math.round(a.x)
      const oy = Math.round(a.y) + bob + hopY

      if (highlight) {
        // anel de seleção
        b.fillStyle = "rgba(255,255,255,0.9)"
        b.fillRect(ox - 6, oy - 11, 13, 1)
        b.fillRect(ox - 6, oy + 3, 13, 1)
        b.fillRect(ox - 6, oy - 11, 1, 15)
        b.fillRect(ox + 6, oy - 11, 1, 15)
      }

      // sombra
      px(ox - 4, oy + 2, 8, 2, "rgba(0,0,0,0.4)")
      // pernas (alternadas se andando)
      const legSplit = moving && Math.sin(a.phase) > 0
      px(ox - 3, oy, 2, 3, "#3a3a3a")
      px(ox + 1, oy, 2, 3, "#3a3a3a")
      if (legSplit) {
        px(ox - 4, oy + 1, 2, 2, "#3a3a3a")
      }
      // corpo
      px(ox - 3, oy - 5, 6, 6, a.body)
      // cabeça
      px(ox - 2, oy - 9, 4, 4, "#a8a8a8")
      // status acima
      px(ox - 1, oy - 13, 3, 3, STATUS_SHADE[a.status])
    }

    function drawReaction(r: Reaction) {
      const y = r.y - (1 - r.life) * 10
      const a = r.life
      b.globalAlpha = a
      if (r.kind === "kudos") {
        // coração pixel
        const s = "#ffffff"
        const ox = Math.round(r.x)
        const oy = Math.round(y)
        px(ox - 2, oy, 1, 1, s)
        px(ox + 1, oy, 1, 1, s)
        px(ox - 3, oy - 1, 5, 1, s)
        px(ox - 2, oy - 2, 3, 1, s)
        px(ox - 1, oy - 3, 1, 1, s)
      }
      b.globalAlpha = 1
    }

    // Balão de conversa entre dois pontos próximos
    function drawBubble(x: number, y: number) {
      px(x - 3, y - 3, 7, 5, "#e5e5e5")
      px(x - 1, y + 2, 2, 2, "#e5e5e5")
      px(x - 2, y - 1, 1, 1, "#0a0a0a")
      px(x, y - 1, 1, 1, "#0a0a0a")
      px(x + 2, y - 1, 1, 1, "#0a0a0a")
    }

    const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)

    // ── Loop ──
    let raf = 0
    let last = performance.now()
    const bubbles: { x: number; y: number; life: number }[] = []
    let bubbleCooldown = 0

    function update(dt: number) {
      // Avatares: seek de waypoint, pausa, repete
      for (const a of avatars) {
        const dx = a.tx - a.x
        const dy = a.ty - a.y
        const dist = Math.hypot(dx, dy)
        if (dist > 0.6) {
          const v = (a.speed * dt) / dist
          a.x += dx * Math.min(v, 1)
          a.y += dy * Math.min(v, 1)
          a.phase += dt * 10
        } else {
          a.sitT -= dt
          if (a.sitT <= 0) {
            const s = SEATS[Math.floor(Math.random() * SEATS.length)]
            a.tx = s.x
            a.ty = s.y
            a.sitT = 2 + Math.random() * 5
            // de vez em quando troca de status (presença sem vigilância)
            if (Math.random() < 0.4) {
              const opts: Status[] = ["available", "focus", "meeting"]
              a.status = opts[Math.floor(Math.random() * opts.length)]
            }
          }
        }
        if (a.hop > 0) a.hop = Math.max(0, a.hop - dt * 2)
      }

      // Proximidade → balão (limitado por cooldown p/ não poluir)
      bubbleCooldown -= dt
      if (bubbleCooldown <= 0) {
        for (let i = 0; i < avatars.length; i++) {
          for (let j = i + 1; j < avatars.length; j++) {
            const a = avatars[i]
            const c = avatars[j]
            if (Math.hypot(a.x - c.x, a.y - c.y) < 16) {
              bubbles.push({ x: (a.x + c.x) / 2, y: Math.min(a.y, c.y) - 14, life: 2 })
              bubbleCooldown = 1.2
            }
          }
        }
      }
      for (let i = bubbles.length - 1; i >= 0; i--) {
        bubbles[i].life -= dt
        if (bubbles[i].life <= 0) bubbles.splice(i, 1)
      }

      // Tasks: cards migram de coluna periodicamente
      for (const t of tasks) {
        if (t.moving) {
          t.t += dt * 0.8
          if (t.t >= 1) {
            t.t = 0
            t.moving = false
            t.col = (t.col + 1) % 3
            t.wait = 2 + Math.random() * 5
            if (t.col === 0) {
              // ciclo completou: confete de conclusão
              for (let k = 0; k < 10; k++)
                reactions.push({
                  x: BOARD.x + 60 + (Math.random() * 10 - 5),
                  y: BOARD.y + 30,
                  life: 1,
                  kind: "ping",
                })
            }
          }
        } else {
          t.wait -= dt
          if (t.wait <= 0) t.moving = true
        }
      }

      // Reações sobem e desaparecem
      for (let i = reactions.length - 1; i >= 0; i--) {
        const r = reactions[i]
        r.life -= dt * (r.kind === "ping" ? 1.6 : 1)
        if (r.kind === "ping") r.y -= dt * 18
        if (r.life <= 0) reactions.splice(i, 1)
      }

      // Hover hit-test
      hovered = -1
      if (mouse.inside) {
        let best = 9
        for (let i = 0; i < avatars.length; i++) {
          const d = Math.hypot(avatars[i].x - mouse.x, avatars[i].y - mouse.y)
          if (d < best) {
            best = d
            hovered = i
          }
        }
      }
    }

    function render() {
      drawFloor()

      // Salas e mobília
      drawRoom(108, 18, 84, 60, "Reuniao")
      drawRoom(14, 22, 60, 44, "Foco")
      drawLabel("Produto", 32, 132)
      drawDesk(32, 150)
      drawDesk(62, 150)
      drawDesk(32, 185)
      drawDesk(62, 185)
      drawLabel("CX", 32, 232)
      drawDesk(32, 250)
      drawDesk(62, 250)
      drawRoom(90, 282, 100, 52, "Copa")
      drawPlant(16, 300)
      drawPlant(180, 150)

      drawBoard()

      // Balões de proximidade
      for (const bb of bubbles) if (bb.life > 0.3) drawBubble(Math.round(bb.x), Math.round(bb.y))

      // Avatares (ordenados por y p/ leve sensação de profundidade)
      const order = avatars.map((_, i) => i).sort((p, q) => avatars[p].y - avatars[q].y)
      for (const i of order) drawAvatar(avatars[i], i === hovered)

      // Reações
      for (const r of reactions) drawReaction(r)

      // Blit escalado (pixels crocantes)
      ctx!.fillStyle = C.bg
      const cw = canvas!.clientWidth
      const ch = canvas!.clientHeight
      ctx!.fillRect(0, 0, cw, ch)
      ctx!.drawImage(buf, 0, 0, W, H, offX, offY, W * scale, H * scale)

      // Tooltip do hover (desenhado na tela, nítido)
      if (hovered >= 0) {
        const a = avatars[hovered]
        const sx = offX + a.x * scale
        const sy = offY + (a.y - 16) * scale
        const text = `${a.name} · ${a.card}`
        ctx!.font = "12px ui-monospace, monospace"
        const tw = ctx!.measureText(text).width
        const padX = 8
        const bw = tw + padX * 2
        let bx = sx - bw / 2
        bx = Math.max(6, Math.min(cw - bw - 6, bx))
        const by = Math.max(6, sy - 26)
        ctx!.fillStyle = "rgba(255,255,255,0.95)"
        ctx!.fillRect(bx, by, bw, 22)
        ctx!.fillStyle = "#0a0a0a"
        ctx!.textBaseline = "middle"
        ctx!.fillText(text, bx + padX, by + 12)
      }
    }

    function frame(now: number) {
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      update(dt)
      render()
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      canvas.removeEventListener("pointermove", onMove)
      canvas.removeEventListener("pointerleave", onLeave)
      canvas.removeEventListener("pointerdown", onClick)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="block h-full w-full cursor-pointer"
      style={{ imageRendering: "pixelated" }}
    />
  )
}
