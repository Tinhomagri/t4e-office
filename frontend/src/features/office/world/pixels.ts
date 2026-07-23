// Utilitários de pixel art para o mundo do Escritório.
//
// Tudo é desenhado em código, na grade nativa de 16px — nenhum asset externo,
// nenhuma imagem carregada. As funções aqui operam sempre em coordenadas
// inteiras: meio pixel em pixel art vira borrão na hora do upscale.

export type Ctx = CanvasRenderingContext2D

/** Canvas offscreen com suavização desligada — a base de todo raster do mundo. */
export function makeCanvas(w: number, h: number): { canvas: HTMLCanvasElement; ctx: Ctx } {
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d")!
  ctx.imageSmoothingEnabled = false
  return { canvas, ctx }
}

export function px(ctx: Ctx, x: number, y: number, c: string): void {
  ctx.fillStyle = c
  ctx.fillRect(x | 0, y | 0, 1, 1)
}

export function rect(ctx: Ctx, x: number, y: number, w: number, h: number, c: string): void {
  ctx.fillStyle = c
  ctx.fillRect(x | 0, y | 0, w | 0, h | 0)
}

/** Contorno de 1px (sem preenchimento). */
export function outline(ctx: Ctx, x: number, y: number, w: number, h: number, c: string): void {
  rect(ctx, x, y, w, 1, c)
  rect(ctx, x, y + h - 1, w, 1, c)
  rect(ctx, x, y, 1, h, c)
  rect(ctx, x + w - 1, y, 1, h, c)
}

/** Retângulo com os 4 pixels de canto removidos — o "arredondado" da pixel art. */
export function chamfer(ctx: Ctx, x: number, y: number, w: number, h: number, c: string): void {
  rect(ctx, x + 1, y, w - 2, h, c)
  rect(ctx, x, y + 1, w, h - 2, c)
}

// ── Cor ─────────────────────────────────────────────────────────────────────

function clamp255(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)))
}

export function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function hex([r, g, b]: [number, number, number]): string {
  return "#" + ((1 << 24) + (clamp255(r) << 16) + (clamp255(g) << 8) + clamp255(b)).toString(16).slice(1)
}

/** Escurece com leve deslocamento para o azul — a sombra fria do estilo. */
export function shade(color: string, amount = 0.78): string {
  const [r, g, b] = rgb(color)
  return hex([r * amount, g * (amount + 0.02), b * (amount + 0.08) + 4])
}

/** Clareia mantendo saturação — usado com parcimônia, só onde a luz bate. */
export function tint(color: string, amount = 1.15): string {
  const [r, g, b] = rgb(color)
  return hex([r * amount + 6, g * amount + 5, b * (amount - 0.04) + 3])
}

export function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = rgb(a)
  const [br, bg, bb] = rgb(b)
  return hex([ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t])
}

// ── Aleatoriedade determinística ────────────────────────────────────────────

/** PRNG mulberry32: mesma semente, mesmo escritório — a sala não "pisca" a cada reload. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Hash estável de duas coordenadas — variação por tile sem guardar estado. */
export function hash2(x: number, y: number, seed = 1): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed, 2246822519)
  h = (h ^ (h >>> 13)) >>> 0
  h = Math.imul(h, 1274126177) >>> 0
  // O >>> 0 final é obrigatório: XOR devolve int com SINAL, e um hash negativo
  // vira índice negativo de variação (tile fora do atlas = tile invisível).
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
