// Andar 1 — bullpen em sala única: hall do elevador de um lado, 30 mesas do
// outro, divididas em 3 blocos de 5 colunas empilhados (era 1 fileira só de
// 15 colunas — virava corredor gigante e ilegível em iso). Cada bloco segue
// o MESMO desenho de antes (duas fileiras na mesma orientação, corredor
// largo entre elas) — só empilhado 3 vezes ao invés de esticado na
// horizontal. Continua tudo uma sala só, sem parede cortando os blocos.
import type { LightSource, OfficeMap, PlacedProp, Seat, Zone } from "../map"
import { PROPS, type PropKind } from "../props"
import { SOLID_TILES, T, TILE } from "../tiles"

const COLS = 30
const COLS_PER_BLOCK = 5
const BLOCKS = 3
// Distância (em linhas) do topo de um bloco pro topo do próximo — dá espaço
// pra fileira A, corredor, fileira B e um respiro antes do bloco seguinte.
const BLOCK_STRIDE = 13
const ROWS = 1 + BLOCK_STRIDE * BLOCKS + 1

// 5 colunas de baia por bloco, encostadas.
const CUBICLE_COLS = Array.from({ length: COLS_PER_BLOCK }, (_, i) => 8 + i * 4)

/** Linha do topo da fileira A/B de um bloco (0-based). Fileira B usa a MESMA
 * orientação da A ("cubicle", não "cubicleFlip"): a divisória dela é que
 * encara o corredor largo entre as duas, não a abertura. */
function blockRows(block: number): { a: number; b: number } {
  const top = 1 + block * BLOCK_STRIDE
  return { a: top, b: top + 6 }
}

function idx(x: number, y: number): number {
  return y * COLS + x
}

function fill(grid: Uint8Array, x: number, y: number, w: number, h: number, value: number): void {
  for (let j = y; j < y + h; j++) {
    for (let i = x; i < x + w; i++) {
      if (i >= 0 && i < COLS && j >= 0 && j < ROWS) grid[idx(i, j)] = value
    }
  }
}

/**
 * Casca de cômodo estilo Habbo: só as paredes de FUNDO (norte) e ESQUERDA
 * (oeste) existem de verdade, mais altas. Frente (sul) e direita ficam sem
 * parede nenhuma — o chão vai até a borda do mapa; o limite do mundo (não dá
 * pra sair andando) vem do próprio fim da grade (`isSolid` bloqueia fora dos
 * limites), não de um tile de parede.
 */
function room(grid: Uint8Array, x: number, y: number, w: number, h: number, floor: number): void {
  fill(grid, x, y, w, h, floor)
  fill(grid, x, y, w, 1, T.WALL_TOP)
  fill(grid, x, y + 1, w, 1, T.WALL)
  fill(grid, x, y + 1, 1, h - 1, T.WALL_V)
}

export function buildFloor1(): OfficeMap {
  const floor = new Uint8Array(COLS * ROWS).fill(T.VOID)

  room(floor, 0, 0, COLS, ROWS, T.WOOD)

  // Hall do elevador: ladrilho, encostado na parede oeste, sobe pela altura
  // inteira do prédio — dá acesso direto a qualquer um dos 3 blocos.
  fill(floor, 1, 1, 6, ROWS - 2, T.TILEFLOOR)

  const collision = new Uint8Array(COLS * ROWS)
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      collision[idx(x, y)] = SOLID_TILES.has(floor[idx(x, y)]) ? 1 : 0
    }
  }

  const props: PlacedProp[] = []
  const add = (kind: PropKind, tx: number, ty: number) =>
    props.push({ kind, x: tx * TILE, y: ty * TILE })

  add("elevatorDoors", 2, 2)
  add("waterCooler", 7, 1)

  const seatId = (prefix: string, x: number, y: number) =>
    `${prefix}-${Math.floor(x / TILE)}-${Math.floor(y / TILE)}`

  const seats: Seat[] = []
  const lights: LightSource[] = [
    { x: 4 * TILE, y: 2 * TILE, radius: 36, color: "#e8d24a", flicker: 0.14 },
  ]

  for (let block = 0; block < BLOCKS; block++) {
    const { a: topA, b: topB } = blockRows(block)

    for (const tx of CUBICLE_COLS) {
      add("cubicle", tx, topA)
      add("cubicle", tx, topB)
    }

    add("plant", 26, topA + 3)
    add("lamp", 18, topA)
    add("lamp", 18, topB)
    lights.push({ x: 18 * TILE + 8, y: topA * TILE + 8, radius: 96, color: "#ffe6bd", flicker: 0 })
    lights.push({ x: 18 * TILE + 8, y: topB * TILE + 8, radius: 96, color: "#ffe6bd", flicker: 0 })

    for (const tx of CUBICLE_COLS) {
      const s1x = (tx + 1) * TILE
      const s1y = (topA + 3) * TILE + 4
      const s2x = (tx + 2) * TILE
      const s2y = (topB + 3) * TILE + 4
      // A mesa fica ao NORTE do assento (a divisória do cubicle é que fica ao
      // sul, na borda de entrada) — sentado, o avatar precisa olhar pra cima
      // pra encarar a própria mesa, não pra baixo (que olharia pro corredor).
      seats.push({ id: seatId("ws", s1x, s1y), x: s1x, y: s1y, facing: "up", label: "Baia", kind: "pc" })
      seats.push({ id: seatId("ws", s2x, s2y), x: s2x, y: s2y, facing: "up", label: "Baia", kind: "pc" })
      // Cadeira encostada na mesa — o assento (onde o avatar para) fica 2
      // tiles ao sul da mesa (aisle de passagem); a cadeira em si precisa
      // ficar bem mais perto da mesa, senão sobra vão vazio entre as duas.
      props.push({ kind: "chair", x: s1x - 6, y: s1y - 6 - 24 })
      props.push({ kind: "chair", x: s2x - 6, y: s2y - 6 - 24 })
    }
  }

  // Props gravam colisão pelo retângulo que ocupam.
  for (const p of props) {
    const def = PROPS[p.kind]
    if (!def.solid) continue
    const sx = Math.floor((p.x + def.solid.x) / TILE)
    const sy = Math.floor((p.y + def.solid.y) / TILE)
    const ex = Math.ceil((p.x + def.solid.x + def.solid.w) / TILE)
    const ey = Math.ceil((p.y + def.solid.y + def.solid.h) / TILE)
    for (let y = sy; y < ey; y++) {
      for (let x = sx; x < ex; x++) {
        if (x >= 0 && x < COLS && y >= 0 && y < ROWS) collision[idx(x, y)] = 1
      }
    }
  }

  const zones: Zone[] = [
    {
      id: "elevator",
      label: "Elevador",
      x: 2, y: 2, w: 4, h: 4,
      accent: "#8a93a0",
      hint: "Aperte E para escolher o andar",
    },
    {
      id: "bullpen",
      label: "Bullpen",
      x: 7, y: 1, w: COLS - 8, h: ROWS - 2,
      accent: "#5d8a52",
      hint: "Estação de trabalho",
    },
  ]

  return {
    cols: COLS,
    rows: ROWS,
    width: COLS * TILE,
    height: ROWS * TILE,
    floor,
    collision,
    props,
    zones,
    lights,
    seats,
    spawn: { x: 4 * TILE, y: 5 * TILE },
  }
}
