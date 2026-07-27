// Céu e cidade atrás do vidro.
//
// Três faixas pintadas uma vez em canvas offscreen e depois só blitadas por
// frame, cada uma deslocando uma fração da câmera. É essa fração diferente por
// camada que o olho lê como distância — e é o que faltava quando cada janela
// era um tile com um céu próprio dentro.
//
// A matemática mora em funções puras porque jsdom não tem canvas: o que dá para
// provar em teste é o deslocamento, não o desenho.
import { type Ctx, hash2, makeCanvas, mix, px, rect } from "./pixels"

/** Fração da câmera que cada camada acompanha. Menor = mais longe. */
export const SKY_PARALLAX = {
  clouds: 0.05,
  far: 0.08,
  near: 0.15,
} as const

/** Deriva horizontal das nuvens, independente da câmera. */
export const CLOUD_DRIFT_PX_PER_S = 2

/** Faixa larga o bastante para cobrir a viewport na maior escala útil. */
export const SKY_STRIP_W = 512
export const SKY_STRIP_H = 256

export interface SkyLayers {
  sky: HTMLCanvasElement
  far: HTMLCanvasElement
  near: HTMLCanvasElement
  clouds: HTMLCanvasElement
}

// ── Matemática (pura, testável) ─────────────────────────────────────────────

/** Deslocamento de uma camada para a posição de câmera dada. */
export function skyOffset(factor: number, cam: number): number {
  return Math.round(cam * factor)
}

/** Deslocamento das nuvens: paralaxe + deriva, em loop na largura da faixa. */
export function cloudOffset(cam: number, elapsedSec: number, stripW = SKY_STRIP_W): number {
  const raw = skyOffset(SKY_PARALLAX.clouds, cam) + elapsedSec * CLOUD_DRIFT_PX_PER_S
  const wrapped = raw % stripW
  return Math.round(wrapped < 0 ? wrapped + stripW : wrapped)
}

/** Recorte da faixa a blitar neste frame, já em loop dentro dela. */
export function layerRect(
  factor: number,
  camX: number,
  camY: number,
  viewW: number,
  viewH: number,
  stripW = SKY_STRIP_W,
  stripH = SKY_STRIP_H,
): { sx: number; sy: number; sw: number; sh: number } {
  const sx = skyOffset(factor, camX) % stripW
  const sy = Math.min(Math.max(0, skyOffset(factor, camY)), Math.max(0, stripH - viewH))
  return {
    sx: sx < 0 ? sx + stripW : sx,
    sy,
    sw: viewW,
    sh: viewH,
  }
}

// ── Pintura (canvas, não testada) ───────────────────────────────────────────

const SKY_TOP = "#4f7fb0"
const SKY_MID = "#7ea9c9"
const SKY_LOW = "#b7cfdd"
const SKY_HAZE = "#d8e4e6"

/** Silhueta de torre: bloco com topo recortado e, opcionalmente, janelas. */
function tower(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  windows: boolean,
  seed: number,
): void {
  rect(ctx, x, y, w, h, color)
  rect(ctx, x, y, w, 1, mix(color, "#ffffff", 0.18))
  // Caixa d'água / antena no topo, alternando por hash — silhueta irregular é
  // o que impede a skyline de virar gráfico de barras.
  const cap = hash2(x, seed, 3)
  if (cap > 0.66) rect(ctx, x + Math.floor(w / 3), y - 3, Math.max(2, w - 6), 3, color)
  else if (cap > 0.33) rect(ctx, x + Math.floor(w / 2), y - 5, 1, 5, color)
  if (!windows) return
  const lit = mix(color, "#ffe6bd", 0.5)
  for (let wy = y + 3; wy < y + h - 2; wy += 4) {
    for (let wx = x + 2; wx < x + w - 2; wx += 3) {
      if (hash2(wx, wy, seed) > 0.62) px(ctx, wx, wy, lit)
    }
  }
}

function drawSkyGradient(ctx: Ctx): void {
  const bands: [string, number][] = [
    [SKY_TOP, 0],
    [mix(SKY_TOP, SKY_MID, 0.5), 0.28],
    [SKY_MID, 0.5],
    [SKY_LOW, 0.72],
    [SKY_HAZE, 0.9],
  ]
  bands.forEach(([color, at], i) => {
    const y = Math.floor(at * SKY_STRIP_H)
    const next = i + 1 < bands.length ? Math.floor(bands[i + 1][1] * SKY_STRIP_H) : SKY_STRIP_H
    rect(ctx, 0, y, SKY_STRIP_W, next - y, color)
  })
  // Halo do sol, alto e à direita.
  const sun = mix(SKY_TOP, "#ffe9c0", 0.55)
  for (let r = 26; r > 0; r -= 6) {
    rect(ctx, 380 - r, 40 - r, r * 2, r * 2, mix(SKY_TOP, sun, 0.3 + (26 - r) / 60))
  }
}

/** Uma faixa de skyline. `near` decide altura, cor e se tem janela acesa. */
function drawSkyline(ctx: Ctx, near: boolean, seed: number): void {
  const baseY = near ? 168 : 196
  const color = near ? mix("#3f5a72", SKY_HAZE, 0.25) : mix("#3f5a72", SKY_HAZE, 0.55)
  let x = -6
  let i = 0
  while (x < SKY_STRIP_W + 6) {
    const w = near ? 14 + Math.floor(hash2(i, seed, 7) * 16) : 10 + Math.floor(hash2(i, seed, 11) * 12)
    const h = near ? 30 + Math.floor(hash2(i, seed, 13) * 62) : 18 + Math.floor(hash2(i, seed, 17) * 34)
    tower(ctx, x, baseY - h, w, h + 60, color, near, seed + i)
    x += w + (near ? 3 : 2)
    i++
  }
}

function cloud(ctx: Ctx, x: number, y: number, w: number, seed: number): void {
  const body = "rgba(255,255,255,0.82)"
  const under = "rgba(214,229,238,0.8)"
  rect(ctx, x + 3, y + 2, w - 6, 4, body)
  rect(ctx, x, y + 5, w, 4, body)
  rect(ctx, x + 2, y + 9, w - 4, 2, under)
  const bump = 4 + Math.floor(hash2(x, seed, 19) * (w - 10))
  rect(ctx, x + bump, y, 6, 3, body)
}

/**
 * Pinta as quatro faixas. Uma chamada por montagem de andar; depois é só blit.
 * Semente fixa: a cidade tem de ser a mesma para todos no workspace.
 */
export function buildSky(seed = 20260726): SkyLayers {
  const sky = makeCanvas(SKY_STRIP_W, SKY_STRIP_H)
  drawSkyGradient(sky.ctx)

  const far = makeCanvas(SKY_STRIP_W, SKY_STRIP_H)
  drawSkyline(far.ctx, false, seed)

  const near = makeCanvas(SKY_STRIP_W, SKY_STRIP_H)
  drawSkyline(near.ctx, true, seed + 977)

  const clouds = makeCanvas(SKY_STRIP_W, SKY_STRIP_H)
  // Cinco nuvens em duas alturas. A faixa é blitada em loop, então a nuvem que
  // sai pela direita reaparece pela esquerda sem costura visível.
  const spec: [number, number, number][] = [
    [20, 26, 34],
    [140, 54, 26],
    [250, 18, 42],
    [330, 62, 30],
    [430, 34, 28],
  ]
  for (const [x, y, w] of spec) cloud(clouds.ctx, x, y, w, seed)

  return { sky: sky.canvas, far: far.canvas, near: near.canvas, clouds: clouds.canvas }
}
