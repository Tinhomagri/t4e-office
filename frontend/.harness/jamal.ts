// Harness visual do Passinho do Jamal.
//
// Mostra três coisas de uma vez:
//  1. a tira dos 16 frames ampliada 7×, para conferir pose a pose;
//  2. o clipe rodando em loop a 24fps nas 4 direções, que é como o Escritório
//     vai exibir;
//  3. a mesma tira com uma régua de tempo, para bater com o vídeo de referência.
//
// Uso: npx esbuild .harness/jamal.ts --bundle --outfile=.harness/jamal.js --alias:@=./src
import { DEFAULT_AVATAR, ANIMS, ANIM_FPS, DIRS, FH, FW } from "@/features/avatar/avatar.types"
import { buildAvatarSheet } from "@/features/avatar/chibi"

const ANIM = "jamal"
const Z = 7

const sheet = buildAvatarSheet(DEFAULT_AVATAR)
const total = ANIMS[ANIM]
const fps = ANIM_FPS[ANIM]

const root = document.getElementById("root")!

function label(text: string) {
  const el = document.createElement("p")
  el.textContent = text
  el.style.cssText = "color:#8a8c93;font:12px monospace;margin:18px 0 6px"
  root.appendChild(el)
}

function ctxFor(w: number, h: number): CanvasRenderingContext2D {
  const c = document.createElement("canvas")
  c.width = w
  c.height = h
  c.style.imageRendering = "pixelated"
  c.style.background = "#2a2d33"
  root.appendChild(c)
  const ctx = c.getContext("2d")!
  ctx.imageSmoothingEnabled = false
  return ctx
}

// ── 1. Tira de frames, direção "down" ───────────────────────────────────────
label(`${ANIM} — ${total} frames @ ${fps}fps = ${(total / fps).toFixed(3)}s por ciclo`)
{
  const ctx = ctxFor(total * FW * Z, FH * Z + 16)
  const frames = sheet.frames[`down_${ANIM}`]
  frames.forEach((f, i) => {
    ctx.drawImage(sheet.canvas, f.x, f.y, FW, FH, i * FW * Z, 0, FW * Z, FH * Z)
    ctx.fillStyle = i % 4 === 0 ? "#4bce97" : "#63656c"
    ctx.font = "11px monospace"
    ctx.fillText(String(i), i * FW * Z + 3, FH * Z + 12)
  })
}

// ── 2. Loop nas 4 direções ──────────────────────────────────────────────────
label(`loop a ${fps}fps — down · up · left · right`)
{
  const ctx = ctxFor(4 * FW * Z * 2, FH * Z * 2)
  const start = performance.now()
  const tick = () => {
    const f = Math.floor(((performance.now() - start) / 1000) * fps) % total
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
    DIRS.forEach((dir, i) => {
      const p = sheet.frames[`${dir}_${ANIM}`][f]
      ctx.drawImage(sheet.canvas, p.x, p.y, FW, FH, i * FW * Z * 2, 0, FW * Z * 2, FH * Z * 2)
    })
    requestAnimationFrame(tick)
  }
  tick()
}

// ── 3. Comparação com o vídeo ───────────────────────────────────────────────
// Vídeo em cima, sprite embaixo, mesmo índice de frame. É assim que dá para
// apontar exatamente qual pose está errada, em vez de discutir "no geral".
label("referência (vídeo, 12fps a partir de 5,0s) × sprite, frame a frame")
{
  const row = document.createElement("div")
  row.style.cssText = "display:flex;gap:4px;flex-wrap:wrap"
  root.appendChild(row)
  const frames = sheet.frames[`down_${ANIM}`]
  for (let i = 0; i < total; i++) {
    const cell = document.createElement("div")
    cell.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:2px"

    const img = document.createElement("img")
    // ffmpeg numera a partir de 1.
    img.src = `ref/f${String(i + 1).padStart(2, "0")}.png`
    img.style.cssText = "height:150px;image-rendering:auto"
    cell.appendChild(img)

    const c = document.createElement("canvas")
    c.width = FW * 4
    c.height = FH * 4
    c.style.cssText = "image-rendering:pixelated;background:#2a2d33"
    const cx = c.getContext("2d")!
    cx.imageSmoothingEnabled = false
    cx.drawImage(sheet.canvas, frames[i].x, frames[i].y, FW, FH, 0, 0, FW * 4, FH * 4)
    cell.appendChild(c)

    const n = document.createElement("span")
    n.textContent = String(i)
    n.style.cssText = "color:#4bce97;font:11px monospace"
    cell.appendChild(n)
    row.appendChild(cell)
  }
}

// ── 4. Régua de tempo ───────────────────────────────────────────────────────
label("tempo de cada frame (ms desde o início do ciclo)")
{
  const el = document.createElement("pre")
  el.style.cssText = "color:#579dff;font:11px monospace;white-space:pre-wrap;max-width:900px"
  el.textContent = Array.from({ length: total }, (_, i) => `${i}:${Math.round((i / fps) * 1000)}ms`).join("  ")
  root.appendChild(el)
}
