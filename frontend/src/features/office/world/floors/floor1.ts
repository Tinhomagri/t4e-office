// Andar 1 — bullpen em sala única: hall do elevador de um lado, 15 pares de
// baia do outro. As duas fileiras olham pro MESMO lado (sul) — o corredor
// central fica de frente pra fileira de cima e de costas pra fileira de
// baixo (a divisória dela é que encara o corredor), não "encaradas" uma coma
// outra. O corredor também ficou mais largo.
//
// Chegou a existir uma versão em 3 salas conectadas por corredor — o pedido
// era corrigir a leitura ruim da câmera isométrica num corredor de 70×10.
// Voltou pra sala única a pedido: o visual de duas fileiras sem paredes
// cortando o ambiente valeu mais que a proporção mais quadrada.
import type { LightSource, OfficeMap, PlacedProp, Seat, Zone } from "../map"
import { PROPS, type PropKind } from "../props"
import { SOLID_TILES, T, TILE } from "../tiles"

const COLS = 70
const ROWS = 13

// 15 colunas de baia, encostadas.
const CUBICLE_COLS = Array.from({ length: 15 }, (_, i) => 8 + i * 4)

// Fileira de cima: abre pro corredor (linha TOP_TY_A+3 = 4).
const TOP_TY_A = 1
// Corredor largo entre as duas fileiras: linhas 4 a 6 (3 tiles livres, era 1).
// Fileira de baixo usa a MESMA orientação da de cima ("cubicle", não
// "cubicleFlip"): a divisória dela (não a abertura) é que encara o corredor.
const TOP_TY_B = 7

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

/** Casca de cômodo: piso + contorno de parede, topo em WALL_TOP. */
function room(grid: Uint8Array, x: number, y: number, w: number, h: number, floor: number): void {
  fill(grid, x, y, w, h, floor)
  fill(grid, x, y, w, 1, T.WALL_TOP)
  fill(grid, x, y + 1, w, 1, T.WALL)
  fill(grid, x, y + h - 1, w, 1, T.WALL)
  fill(grid, x, y + 1, 1, h - 1, T.WALL_V)
  fill(grid, x + w - 1, y + 1, 1, h - 1, T.WALL_V)
}

export function buildFloor1(): OfficeMap {
  const floor = new Uint8Array(COLS * ROWS).fill(T.VOID)

  room(floor, 0, 0, COLS, ROWS, T.WOOD)

  // Hall do elevador: ladrilho, encostado na parede oeste.
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

  // As duas fileiras usam "cubicle" — mesma orientação, ninguém de costas
  // pra câmera, mas a fileira de baixo fica de costas pro CORREDOR (a
  // divisória dela encara quem anda ali), não de frente pra fileira de cima.
  for (const tx of CUBICLE_COLS) {
    add("cubicle", tx, TOP_TY_A)
    add("cubicle", tx, TOP_TY_B)
  }

  add("elevatorDoors", 2, 2)
  add("waterCooler", 7, 1)
  add("plant", 68, 3)
  add("plant", 68, 9)
  add("lamp", 36, 1)
  add("lamp", 36, 7)

  const seatId = (prefix: string, x: number, y: number) =>
    `${prefix}-${Math.floor(x / TILE)}-${Math.floor(y / TILE)}`

  const seats: Seat[] = []
  for (const tx of CUBICLE_COLS) {
    const s1x = (tx + 1) * TILE
    const s1y = (TOP_TY_A + 3) * TILE + 4
    const s2x = (tx + 2) * TILE
    const s2y = (TOP_TY_B + 3) * TILE + 4
    // A mesa fica ao NORTE do assento (a divisória do cubicle é que fica ao
    // sul, na borda de entrada) — sentado, o avatar precisa olhar pra cima
    // pra encarar a própria mesa, não pra baixo (que olharia pro corredor).
    seats.push({ id: seatId("ws", s1x, s1y), x: s1x, y: s1y, facing: "up", label: "Baia", kind: "pc" })
    seats.push({ id: seatId("ws", s2x, s2y), x: s2x, y: s2y, facing: "up", label: "Baia", kind: "pc" })
    // Cadeira visível bem embaixo do assento (não em tile arredondado — o
    // desalinho de até meio tile é o que fazia ela cair longe do teclado).
    // O centro do estofado da cadeira fica a (6,6) da própria âncora.
    props.push({ kind: "chair", x: s1x - 6, y: s1y - 6 })
    props.push({ kind: "chair", x: s2x - 6, y: s2y - 6 })
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

  const lights: LightSource[] = [
    { x: 36 * TILE + 8, y: (TOP_TY_A) * TILE + 8, radius: 96, color: "#ffe6bd", flicker: 0 },
    { x: 36 * TILE + 8, y: (TOP_TY_B) * TILE + 8, radius: 96, color: "#ffe6bd", flicker: 0 },
    { x: 4 * TILE, y: 2 * TILE, radius: 36, color: "#e8d24a", flicker: 0.14 },
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
