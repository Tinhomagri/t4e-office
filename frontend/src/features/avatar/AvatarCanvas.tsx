import { useEffect, useRef } from "react"

import { buildAvatarSheet } from "./chibi"
import { ANIM_FPS, ANIMS, FH, FW, type AvatarConfig, type Direction } from "./avatar.types"

interface Props {
  config: AvatarConfig
  anim?: string
  dir?: Direction
  scale?: number
  className?: string
}

// Player de avatar em Canvas 2D puro: reconstrói o spritesheet quando o config
// muda e faz blit do frame atual num requestAnimationFrame (imageSmoothing off).
export function AvatarCanvas({ config, anim = "idle", dir = "down", scale = 9, className }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")!

    // Resolução de backing alinhada ao devicePixelRatio: sem isso o browser
    // re-amostra o raster em telas HiDPI e borra a pixel art. CSS fica no
    // tamanho lógico; o backing tem dpr× pixels e o blit usa escala integral.
    const dpr = Math.max(1, Math.round(window.devicePixelRatio || 1))
    const cssW = FW * scale
    const cssH = FH * scale
    canvas.width = cssW * dpr
    canvas.height = cssH * dpr
    canvas.style.width = `${cssW}px`
    canvas.style.height = `${cssH}px`
    ctx.imageSmoothingEnabled = false
    const draw = scale * dpr // escala integral total do frame 32×32 → backing

    const sheet = buildAvatarSheet(config)
    const key = `${dir}_${anim}`
    const frames = sheet.frames[key] ?? sheet.frames[`down_${anim}`] ?? sheet.frames["down_idle"]
    const fps = ANIM_FPS[anim] ?? 6
    const total = ANIMS[anim] ?? frames.length

    let raf = 0
    let acc = 0
    let last = 0
    let fi = 0
    const loop = (t: number) => {
      if (!last) last = t
      acc += t - last
      last = t
      if (acc >= 1000 / fps) {
        acc = 0
        fi = (fi + 1) % total
        const fr = frames[fi]
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(sheet.canvas, fr.x, fr.y, FW, FH, 0, 0, FW * draw, FH * draw)
      }
      raf = requestAnimationFrame(loop)
    }
    // primeiro frame imediato
    const fr0 = frames[0]
    ctx.drawImage(sheet.canvas, fr0.x, fr0.y, FW, FH, 0, 0, FW * draw, FH * draw)
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [config, anim, dir, scale])

  return <canvas ref={ref} className={className} style={{ imageRendering: "pixelated" }} />
}
