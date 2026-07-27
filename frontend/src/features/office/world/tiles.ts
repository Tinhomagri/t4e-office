// Tiles 16×16 do escritório, pintados proceduralmente num atlas offscreen.
//
// A paleta segue a mesma regra do avatar: terrosa, dessaturada, 2 tons por
// superfície (base + sombra fria), contorno marrom-café em vez de preto puro.
// Cada tile tem 4 variações sorteadas por hash da posição — é o que impede o
// piso de virar um padrão xadrez óbvio.
import { type Ctx, hash2, makeCanvas, mix, px, rect, shade, tint } from "./pixels"

export const TILE = 16

export const INK = "#2b1e1a"

// Cores das divisórias/equipamento de escritório do bullpen (task 6).
const PANEL_BASE = "#8f9a8c"

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
  glassFrame: "#6b727a",
  glassTint: "rgba(190,222,240,0.16)",
  deck: "#b98d5f",
  panel: PANEL_BASE,
  panelDark: shade(PANEL_BASE, 0.78),
  steel: "#9aa0a8",
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
  DOORWAY: 7,
  WALL_V: 8,
  /** Vidro do piso ao teto: caixilho opaco, miolo transparente. */
  GLASS: 9,
  /** Igual ao vidro, com puxador e passável. */
  GLASS_DOOR: 10,
  /** Piso da varanda — tábuas no sol. */
  DECK: 11,
  /** Guarda-corpo: montantes com vão, céu aparece no meio. */
  RAILING: 12,
} as const

export type TileId = (typeof T)[keyof typeof T]

/** Tiles que bloqueiam passagem. */
export const SOLID_TILES = new Set<number>([
  T.VOID, T.WALL, T.WALL_TOP, T.WALL_V, T.GLASS, T.RAILING,
])

/**
 * Tiles cujo pintor NÃO preenche o fundo: os pixels vazios revelam a camada de
 * céu desenhada atrás do piso. Sem isso o vidro fica opaco e volta o efeito de
 * adesivo na parede.
 */
export const ALPHA_TILES = new Set<number>([T.GLASS, T.GLASS_DOOR, T.RAILING])

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

/**
 * Vidro do piso ao teto. Só caixilho, reflexo e véu leve são pintados — o resto
 * fica transparente para o céu aparecer, contínuo entre tiles vizinhos.
 */
function drawGlass(ctx: Ctx, v: number): void {
  rect(ctx, 0, 0, TILE, TILE, COLORS.glassTint)
  // Montante só na borda ESQUERDA: um a cada 16px. Montante nas duas bordas
  // faria dois tiles vizinhos encostarem montante com montante — linha dupla
  // lendo como grade de janelinhas, o oposto do pano contínuo.
  rect(ctx, 0, 0, 1, TILE, COLORS.glassFrame)
  rect(ctx, 0, 0, TILE, 1, shade(COLORS.glassFrame, 0.8))
  rect(ctx, 0, 15, TILE, 1, shade(COLORS.glassFrame, 0.7))
  // Reflexo diagonal, deslocado por variação — quebra a repetição do tile.
  const off = v * 3
  for (let i = 0; i < 5; i++) {
    px(ctx, 3 + i + off - (off > 8 ? 9 : 0), 4 + i, "rgba(255,255,255,0.22)")
  }
}

function drawGlassDoor(ctx: Ctx, v: number): void {
  drawGlass(ctx, v)
  // Puxador vertical + soleira, para ler como porta e não como pano de vidro.
  rect(ctx, 11, 6, 1, 5, tint(COLORS.metal, 1.1))
  rect(ctx, 0, 14, TILE, 2, COLORS.metalDark)
}

/** Deck da varanda: tábuas no sentido da profundidade, mais claras (está no sol). */
function drawDeck(ctx: Ctx, v: number): void {
  const base = tint(COLORS.deck, 1.06)
  rect(ctx, 0, 0, TILE, TILE, base)
  // Juntas VERTICAIS em x fixo — continuam de um tile ao seguinte.
  for (const x of [0, 5, 10, 15]) {
    rect(ctx, x, 0, 1, TILE, shade(base, 0.72))
    rect(ctx, x + 1, 0, 1, TILE, tint(base, 1.05))
  }
  for (let i = 0; i < 3; i++) {
    const gy = 2 + Math.floor(hash2(v, i, 13) * (TILE - 5))
    const band = Math.floor(hash2(i, v, 29) * 3)
    rect(ctx, band * 5 + 2, gy, 1, 2 + (i % 2), shade(base, 0.84))
  }
}

/** Guarda-corpo: corrimão contínuo + montantes com vão de céu entre eles. */
function drawRailing(ctx: Ctx, v: number): void {
  rect(ctx, 0, 3, TILE, 2, COLORS.metal)
  rect(ctx, 0, 3, TILE, 1, tint(COLORS.metal, 1.18))
  rect(ctx, 0, 10, TILE, 1, COLORS.metalDark)
  // Dois montantes por tile: passo de 8 px mantém o ritmo entre tiles vizinhos.
  for (const x of [3, 11]) rect(ctx, x, 5, 1, 8, COLORS.metalDark)
  // Base: onde o guarda-corpo encontra o deck.
  rect(ctx, 0, 13, TILE, 1, shade(COLORS.deck, 0.7))
  if (v % 2 === 0) px(ctx, 7, 4, "rgba(255,255,255,0.3)")
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
  [T.DOORWAY]: drawDoorway,
  [T.WALL_V]: drawWallV,
  [T.GLASS]: drawGlass,
  [T.GLASS_DOOR]: drawGlassDoor,
  [T.DECK]: drawDeck,
  [T.RAILING]: drawRailing,
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
