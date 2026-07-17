// Exportação PNG do avatar em escala inteira, com fundo opcional.
// Renderiza a partir do spritesheet do chibi (mesma fonte do preview) num
// canvas off-screen com imageSmoothing desligado — pixels sempre crisp.
import { buildAvatarSheet } from "./chibi"
import { FH, FW, type AvatarConfig, type Direction } from "./avatar.types"

export interface ExportOptions {
  scale: 1 | 2 | 4 | 8
  background: string | null // null = transparente
  frames: 1 | 2 // 1 = frame único; 2 = spritesheet com o offset do idle
  dir?: Direction
}

export function renderAvatarPng(config: AvatarConfig, opts: ExportOptions): HTMLCanvasElement {
  const { scale, background, frames } = opts
  const dir = opts.dir ?? "down"

  const sheet = buildAvatarSheet(config)
  const clip = sheet.frames[`${dir}_idle`] ?? sheet.frames["down_idle"]

  const out = document.createElement("canvas")
  out.width = FW * scale * frames
  out.height = FH * scale
  const ctx = out.getContext("2d")!
  ctx.imageSmoothingEnabled = false

  if (background) {
    ctx.fillStyle = background
    ctx.fillRect(0, 0, out.width, out.height)
  }

  for (let i = 0; i < frames; i++) {
    // Frame 0 e um frame do meio do clipe idle (postura levemente diferente).
    const fr = clip[i === 0 ? 0 : Math.floor(clip.length / 2)]
    ctx.drawImage(sheet.canvas, fr.x, fr.y, FW, FH, i * FW * scale, 0, FW * scale, FH * scale)
  }
  return out
}

export function downloadCanvasPng(canvas: HTMLCanvasElement, filename: string): void {
  canvas.toBlob((blob) => {
    if (!blob) return
    triggerDownload(URL.createObjectURL(blob), filename)
  }, "image/png")
}

export function downloadText(text: string, filename: string): void {
  const blob = new Blob([text], { type: "application/json" })
  triggerDownload(URL.createObjectURL(blob), filename)
}

function triggerDownload(url: string, filename: string): void {
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5_000)
}
