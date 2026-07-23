// Tiles 16×16 do escritório, pintados proceduralmente num atlas offscreen.
//
// A paleta segue a mesma regra do avatar: terrosa, dessaturada, 2 tons por
// superfície (base + sombra fria), contorno marrom-café em vez de preto puro.
// Cada tile tem 4 variações sorteadas por hash da posição — é o que impede o
// piso de virar um padrão xadrez óbvio.
import { type Ctx, hash2, makeCanvas, mix, px, rect, shade, tint } from "./pixels"

export const TILE = 16

export const INK = "#2b1e1a"

export const COLORS = {
  woodLight: "#c19a68",
  wood: "#a87d51",
  woodDark: "#8a6440",
  woodSeam: "#6f4f33",
  carpet: "#5f7b7a",
  carpetDark: "#4c6564",
  rug: "#9a5f4e",
  rugDark: "#7e4b3d",
  tileFloor: "#cdc7b6",
  tileFloorDark: "#b3ac9b",
  wall: "#d9cfba",
  wallShade: "#c2b7a1",
  wainscot: "#7d5b41",
  wainscotDark: "#63462f",
  plant: "#5d8a52",
  plantDark: "#456b3d",
  metal: "#9aa0a8",
  metalDark: "#767c85",
} as const

// Identificadores de tile do piso/parede. A ordem define o índice no atlas.
export const T = {
  VOID: 0,
  WOOD: 1,
  CARPET: 2,
  RUG: 3,
  TILEFLOOR: 4,
  WALL: 5,
  WALL_TOP: 6,
  WINDOW: 7,
  DOORWAY: 8,
  WALL_V: 9,
} as const

export type TileId = (typeof T)[keyof typeof T]

/** Tiles que bloqueiam passagem. */
export const SOLID_TILES = new Set<number>([T.VOID, T.WALL, T.WALL_TOP, T.WINDOW, T.WALL_V])

const VARIANTS = 4

// ── Pintores por tile ───────────────────────────────────────────────────────

function drawWood(ctx: Ctx, v: number): void {
  rect(ctx, 0, 0, TILE, TILE, COLORS.wood)
  // Tábuas LONGAS: as juntas horizontais ficam em y fixo (0, 5, 10, 15) para
  // continuarem de um tile ao seguinte. Junta em posição aleatória por tile é
  // o que fazia o piso ler como tijolo em vez de assoalho.
  for (const y of [0, 5, 10, 15]) {
    rect(ctx, 0, y, TILE, 1, COLORS.woodSeam)
    rect(ctx, 0, y + 1, TILE, 1, tint(COLORS.wood, 1.07))
  }
  // Topo de tábua: só 1 tile em cada 4 recebe junta vertical, alternando o
  // lado — dá o escalonamento do assoalho sem virar grade.
  if (v === 0) rect(ctx, 5, 1, 1, 4, COLORS.woodSeam)
  if (v === 2) rect(ctx, 11, 11, 1, 4, COLORS.woodSeam)
  // Veios curtos, sempre dentro de uma tábua (nunca cruzando a junta).
  for (let i = 0; i < 3; i++) {
    const gx = 2 + Math.floor(hash2(v, i, 7) * (TILE - 6))
    const band = Math.floor(hash2(i, v, 11) * 3)
    rect(ctx, gx, band * 5 + 3, 2 + (i % 2), 1, COLORS.woodDark)
  }
}

function drawCarpet(ctx: Ctx, v: number): void {
  rect(ctx, 0, 0, TILE, TILE, COLORS.carpet)
  // Textura felpuda: pontilhado denso e irregular, nunca um padrão regular.
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const n = hash2(x + v * 31, y + v * 17, 3)
      if (n > 0.82) px(ctx, x, y, COLORS.carpetDark)
      else if (n < 0.08) px(ctx, x, y, tint(COLORS.carpet, 1.08))
    }
  }
}

function drawRug(ctx: Ctx, v: number): void {
  rect(ctx, 0, 0, TILE, TILE, COLORS.rug)
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      if (hash2(x + v * 13, y + v * 29, 5) > 0.88) px(ctx, x, y, COLORS.rugDark)
    }
  }
  // Trama fina e contínua entre tiles — nada de motivo centralizado, que
  // repetido pelo cômodo inteiro denuncia a grade de 16px.
  const c = mix(COLORS.rug, "#e0c9a0", 0.28)
  for (let y = 0; y < TILE; y += 4) rect(ctx, 0, y + (v % 2), TILE, 1, c)
}

function drawTileFloor(ctx: Ctx, v: number): void {
  rect(ctx, 0, 0, TILE, TILE, COLORS.tileFloor)
  // Ladrilho 8×8 com rejunte.
  rect(ctx, 0, 7, TILE, 1, COLORS.tileFloorDark)
  rect(ctx, 7, 0, 1, TILE, COLORS.tileFloorDark)
  // Brilho de canto em um dos quadrantes, alternado por variação.
  const qx = v % 2 === 0 ? 1 : 9
  const qy = v < 2 ? 1 : 9
  rect(ctx, qx, qy, 3, 1, tint(COLORS.tileFloor, 1.06))
  for (let i = 0; i < 4; i++) {
    const sx = Math.floor(hash2(v, i, 23) * TILE)
    const sy = Math.floor(hash2(i, v, 41) * TILE)
    px(ctx, sx, sy, COLORS.tileFloorDark)
  }
}

/** Parede de frente (a faixa que o jogador vê): rodapé + reboco + moldura. */
function drawWall(ctx: Ctx, v: number): void {
  rect(ctx, 0, 0, TILE, TILE, COLORS.wall)
  // Textura sutil do reboco.
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      if (hash2(x + v * 7, y + v * 3, 9) > 0.93) px(ctx, x, y, COLORS.wallShade)
    }
  }
  // Boiserie de madeira na metade de baixo + filete de acabamento.
  rect(ctx, 0, 9, TILE, 7, COLORS.wainscot)
  rect(ctx, 0, 9, TILE, 1, tint(COLORS.wainscot, 1.18))
  rect(ctx, 0, 15, TILE, 1, COLORS.wainscotDark)
  for (let x = 3; x < TILE; x += 6) rect(ctx, x, 10, 1, 5, COLORS.wainscotDark)
}

/**
 * Topo da parede visto de cima. Bem mais escuro que a face frontal: é esse
 * contraste que faz o olho ler "parede com espessura" em vez de piso claro.
 */
function drawWallTop(ctx: Ctx, v: number): void {
  const top = shade(COLORS.wallShade, 0.6)
  rect(ctx, 0, 0, TILE, TILE, top)
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      if (hash2(x + v * 5, y + v * 11, 13) > 0.9) px(ctx, x, y, shade(top, 0.9))
    }
  }
  // Quina superior iluminada + sombra na base, dando volume ao bloco.
  rect(ctx, 0, 0, TILE, 1, tint(top, 1.25))
  rect(ctx, 0, 14, TILE, 2, shade(top, 0.78))
}

/** Janela: vidro com céu, caixilho e peitoril. A luz dela é desenhada à parte. */
function drawWindow(ctx: Ctx, v: number): void {
  drawWall(ctx, v)
  rect(ctx, 1, 1, 14, 9, "#5c7f9e")
  // Céu com degradê de 3 faixas + nuvem.
  rect(ctx, 1, 1, 14, 3, "#7ba3c2")
  rect(ctx, 1, 4, 14, 3, "#6a92b3")
  rect(ctx, 3, 3, 4, 1, "#cfe0ea")
  rect(ctx, 4, 2, 2, 1, "#cfe0ea")
  // Prédios distantes.
  rect(ctx, 9, 6, 3, 4, "#4e6a80")
  rect(ctx, 12, 7, 2, 3, "#456075")
  // Caixilho.
  rect(ctx, 0, 0, TILE, 1, COLORS.wainscotDark)
  rect(ctx, 0, 10, TILE, 1, COLORS.wainscotDark)
  rect(ctx, 0, 0, 1, 11, COLORS.wainscotDark)
  rect(ctx, 15, 0, 1, 11, COLORS.wainscotDark)
  rect(ctx, 7, 1, 1, 9, COLORS.wainscotDark)
  // Peitoril.
  rect(ctx, 0, 11, TILE, 1, tint(COLORS.wainscot, 1.2))
}

/**
 * Parede vista de lado (divisórias verticais). A face frontal tem faixas
 * horizontais de boiserie; repetidas numa coluna, viravam listras. Aqui a
 * madeira corre no sentido da parede e as bordas ganham a espessura.
 */
function drawWallV(ctx: Ctx, v: number): void {
  const top = shade(COLORS.wallShade, 0.6)
  rect(ctx, 0, 0, TILE, TILE, top)
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      if (hash2(x + v * 3, y + v * 19, 17) > 0.9) px(ctx, x, y, shade(top, 0.9))
    }
  }
  // Miolo mais claro + quinas escuras: leitura de bloco de parede visto de cima.
  rect(ctx, 4, 0, 8, TILE, COLORS.wallShade)
  rect(ctx, 4, 0, 1, TILE, tint(COLORS.wallShade, 1.16))
  rect(ctx, 11, 0, 1, TILE, shade(COLORS.wallShade, 0.8))
  rect(ctx, 0, 0, 2, TILE, shade(top, 0.82))
  rect(ctx, 14, 0, 2, TILE, shade(top, 0.82))
}

function drawDoorway(ctx: Ctx, v: number): void {
  rect(ctx, 0, 0, TILE, TILE, COLORS.wood)
  drawWood(ctx, v)
  // Batentes laterais marcam a passagem sem bloquear.
  rect(ctx, 0, 0, 1, TILE, COLORS.wainscotDark)
  rect(ctx, 15, 0, 1, TILE, COLORS.wainscotDark)
}

const PAINTERS: Record<number, (ctx: Ctx, v: number) => void> = {
  [T.WOOD]: drawWood,
  [T.CARPET]: drawCarpet,
  [T.RUG]: drawRug,
  [T.TILEFLOOR]: drawTileFloor,
  [T.WALL]: drawWall,
  [T.WALL_TOP]: drawWallTop,
  [T.WINDOW]: drawWindow,
  [T.DOORWAY]: drawDoorway,
  [T.WALL_V]: drawWallV,
}

export interface TileAtlas {
  canvas: HTMLCanvasElement
  /** Posição do tile no atlas: [x, y] em pixels. */
  at(id: number, variant: number): [number, number]
}

/**
 * Pinta todos os tiles × variações num único atlas. Uma chamada por sessão:
 * depois disso, desenhar o mapa é só `drawImage` de recortes.
 */
export function buildTileAtlas(): TileAtlas {
  const ids = Object.values(T).filter((id) => id !== T.VOID)
  const { canvas, ctx } = makeCanvas(VARIANTS * TILE, ids.length * TILE)

  ids.forEach((id, row) => {
    for (let v = 0; v < VARIANTS; v++) {
      ctx.save()
      ctx.translate(v * TILE, row * TILE)
      ctx.beginPath()
      ctx.rect(0, 0, TILE, TILE)
      ctx.clip()
      PAINTERS[id]?.(ctx, v)
      ctx.restore()
    }
  })

  const rowOf = new Map<number, number>()
  ids.forEach((id, row) => rowOf.set(id, row))

  return {
    canvas,
    at(id, variant) {
      const row = rowOf.get(id) ?? 0
      return [(variant % VARIANTS) * TILE, row * TILE]
    },
  }
}

/** Variação estável de um tile pela sua posição no mapa. */
export function tileVariant(x: number, y: number): number {
  return Math.floor(hash2(x, y, 99) * VARIANTS)
}
