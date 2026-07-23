import { useEffect, useRef, useState } from "react"

import { buildAvatarSheet } from "./chibi"
import { ANIM_FPS, ANIMS, FH, FW, type AvatarConfig, type Direction } from "./avatar.types"

interface Props {
  config: AvatarConfig
  anim?: string
  dir?: Direction
  /** Escala fixa. Omita e passe `responsive` para derivar do container. */
  scale?: number
  /** Ocupa o container, escolhendo a maior escala INTEIRA que couber. */
  responsive?: boolean
  className?: string
}

// Player de avatar em Canvas 2D puro: reconstrói o spritesheet quando o config
// muda e faz blit do frame atual num requestAnimationFrame (imageSmoothing off).
export function AvatarCanvas({
  config,
  anim = "idle",
  dir = "down",
  scale,
  responsive = false,
  className,
}: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [autoScale, setAutoScale] = useState(scale ?? 9)

  // Escala derivada do container. Sempre INTEIRA: escala fracionária em pixel
  // art dá colunas de pixel com larguras diferentes e o sprite "ondula".
  useEffect(() => {
    if (!responsive) {
      if (scale) setAutoScale(scale)
      return
    }
    const wrap = wrapRef.current
    if (!wrap) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (width < 1 || height < 1) return
      const fit = Math.min(width / FW, height / FH)
      setAutoScale(Math.max(1, Math.floor(fit)))
    })
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [responsive, scale])

  const drawScale = scale && !responsive ? scale : autoScale

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")!

    // Resolução de backing alinhada ao devicePixelRatio: sem isso o browser
    // re-amostra o raster em telas HiDPI e borra a pixel art.
    const dpr = Math.max(1, Math.round(window.devicePixelRatio || 1))
    const cssW = FW * drawScale
    const cssH = FH * drawScale
    canvas.width = cssW * dpr
    canvas.height = cssH * dpr
    canvas.style.width = `${cssW}px`
    canvas.style.height = `${cssH}px`
    ctx.imageSmoothingEnabled = false
    const draw = drawScale * dpr

    const sheet = buildAvatarSheet(config)
    const key = `${dir}_${anim}`
    const frames = sheet.frames[key] ?? sheet.frames[`down_${anim}`] ?? sheet.frames["down_idle"]
    const fps = ANIM_FPS[anim] ?? 6
    const total = Math.min(ANIMS[anim] ?? frames.length, frames.length)

    const blit = (i: number) => {
      const fr = frames[i % total]
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(sheet.canvas, fr.x, fr.y, FW, FH, 0, 0, FW * draw, FH * draw)
    }

    // O primeiro frame aparece imediatamente — sem esperar um tick do rAF.
    blit(0)

    // Movimento reduzido: fica na pose inicial em vez de rodar o ciclo.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

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
        blit(fi)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [config, anim, dir, drawScale])

  const canvas = <canvas ref={ref} className={className} style={{ imageRendering: "pixelated" }} />

  if (!responsive) return canvas

  return (
    <div ref={wrapRef} className="grid size-full place-items-center">
      {canvas}
    </div>
  )
}
