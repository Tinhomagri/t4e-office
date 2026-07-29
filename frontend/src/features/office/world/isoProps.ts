// Primitivas de móvel isométrico "de verdade" — caixa com 3 faces (topo,
// direita, esquerda) em vez de um desenho achatado cisalhado.
//
// A face é desenhada PLANA (retas, sem suavização) num canvas pequeno e
// "colada" torta via `drawImage` com nearest-neighbor — a mesma técnica de
// `isoBake.ts` pro piso/parede. `ctx.fill()` de polígono NÃO serve pra isso:
// o Canvas sempre antialiasa borda de forma vetorial (não existe flag pra
// desligar), e widening isso vira o borrão que o piso/parede não têm.
import { ISO_FX, ISO_FY } from "./iso"
import { type Ctx, hash2, makeCanvas, px, shade, tint } from "./pixels"

export interface FaceColors {
  top: string
  /** Se omitido, deriva de `top` (mais claro). */
  right?: string
  /** Se omitido, deriva de `top` (mais escuro — a sombra fria do estilo). */
  left?: string
  outline?: string
  /** Salpica ruído de 1px na face — quebra o "plástico liso" das superfícies
   * grandes (tampo de mesa, mesa de reunião). */
  textured?: boolean
}

export function pt(ox: number, oy: number, x: number, y: number): [number, number] {
  return [ox + (x - y) * ISO_FX, oy + (x + y) * ISO_FY]
}

/** Canvas retangular plano (sem antialiasing) com fundo + contorno + ruído
 * opcional — o "material cru" que depois é colado torto via `drawImage`. */
function flatFace(w: number, h: number, fill: string, outline?: string, textured?: boolean): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)))
  ctx.fillStyle = fill
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  if (textured) {
    const dark = shade(fill, 0.88)
    const light = tint(fill, 1.08)
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const n = hash2(x, y, 17)
        if (n > 0.9) px(ctx, x, y, dark)
        else if (n < 0.06) px(ctx, x, y, light)
      }
    }
  }
  if (outline) {
    ctx.strokeStyle = outline
    ctx.lineWidth = 1
    ctx.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1)
  }
  return canvas
}

function blit(ctx: Ctx, img: HTMLCanvasElement, a: number, b: number, c: number, d: number, e: number, f: number): void {
  ctx.save()
  ctx.setTransform(a, b, c, d, e, f)
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(img, 0, 0)
  ctx.restore()
}

/**
 * Caixa isométrica: footprint `w`(eixo X)×`d`(eixo Y) projetado em losango,
 * erguida `h` px. `ox,oy` é o vértice norte do footprint (mesma âncora que os
 * tiles de piso). `raise` sobe a base inteira (pra empilhar objeto sobre
 * objeto, ex.: monitor sobre a mesa).
 */
export function isoBox(
  ctx: Ctx,
  ox: number,
  oy: number,
  w: number,
  d: number,
  h: number,
  colors: FaceColors,
  raise = 0,
): void {
  const by = oy - raise
  const top = colors.top
  const right = colors.right ?? tint(top, 1.12)
  const left = colors.left ?? shade(top, 0.72)
  const out = colors.outline ?? "#2b1e1a"

  // Face direita (aresta E-S, comprimento `d`) — mais clara.
  blit(ctx, flatFace(d, h, right, out), -ISO_FX, ISO_FY, 0, 1, ox + w * ISO_FX, by + w * ISO_FY - h)
  // Face esquerda (aresta W-S, comprimento `w`) — mais escura.
  blit(ctx, flatFace(w, h, left, out), ISO_FX, ISO_FY, 0, 1, ox - d * ISO_FX, by + d * ISO_FY - h)
  // Topo: o mesmo losango do piso, erguido `h`.
  blit(ctx, flatFace(w, d, top, out, colors.textured), ISO_FX, ISO_FY, -ISO_FX, ISO_FY, ox, by - h)
}

/**
 * Painel vertical fino preso na parede (porta, quadro, telão): só a face
 * frontal (aresta N-E, mesma direção do topo dos tiles) — sem base grossa,
 * porque não é um bloco de chão.
 */
export function isoPanel(
  ctx: Ctx,
  ox: number,
  oy: number,
  w: number,
  h: number,
  colors: FaceColors,
  raise = 0,
): void {
  const by = oy - raise
  const out = colors.outline ?? "#2b1e1a"
  blit(ctx, flatFace(w, h, colors.top, out), ISO_FX, ISO_FY, 0, 1, ox, by - h)
}

/**
 * Calcula o canvas mínimo (com folga) e a âncora (vértice norte do
 * footprint) pra caber uma composição de caixas de footprint `w`×`d` e altura
 * total `totalHeight` — poupa fazer essa conta na mão pra cada prop.
 */
export function isoCanvasFor(
  w: number,
  d: number,
  totalHeight: number,
  margin = 6,
): { cw: number; ch: number; ax: number; ay: number } {
  const ax = d + margin
  const ay = totalHeight + margin
  const cw = w + d + margin * 2
  const ch = Math.ceil(totalHeight + (w + d) / 2 + margin * 2)
  return { cw, ch, ax, ay }
}

/** Losango raso (tapete, capacho, decalque) — sem altura. `raise` sobe a
 * altura Z (pra desenhar em cima de uma mesa, por ex.). */
export function isoDiamond(
  ctx: Ctx,
  ox: number,
  oy: number,
  w: number,
  d: number,
  color: string,
  raise = 0,
): void {
  blit(ctx, flatFace(w, d, color), ISO_FX, ISO_FY, -ISO_FX, ISO_FY, ox, oy - raise)
}
