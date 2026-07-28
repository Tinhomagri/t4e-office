// Andar 1 — bullpen compacto.
//
// Um corredor central com 30 baias (15 de cada lado), todas com o mesmo
// assento voltado para baixo — nenhuma de costas para a câmera. Reduz o
// galpão com varanda e fachada de vidro da entrega anterior: aqui o andar é
// só a estação de trabalho, do tamanho de um escritório real.
import type { LightSource, OfficeMap, PlacedProp, Seat, SeatKind, Zone } from "../map"
import { PROPS, type PropKind } from "../props"
import { SOLID_TILES, T, TILE } from "../tiles"

const COLS = 70
const ROWS = 10

// 15 colunas de baia, encostadas — o corredor central é o único acesso, não
// há mais vãos verticais entre clusters como no galpão antigo.
const CUBICLE_COLS = Array.from({ length: 15 }, (_, i) => 8 + i * 4)
const TOP_TY = 1

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

  // Um par cubicle/cubicleFlip por coluna — mesma peça e colisão da entrega
  // anterior. A diferença fica só no assento (ver abaixo): as duas fileiras
  // olham para baixo agora, em vez de uma olhar para cima.
  for (const tx of CUBICLE_COLS) {
    add("cubicle", tx, TOP_TY)
    add("cubicleFlip", tx, TOP_TY + 4)
  }

  add("elevatorDoors", 2, 2)
  add("waterCooler", 7, 1)
  add("plant", 68, 3)
  add("plant", 68, 6)
  add("lamp", 36, 1)
  add("lamp", 36, 7)

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
    { x: 36 * TILE + 8, y: 1 * TILE + 8, radius: 96, color: "#ffe6bd", flicker: 0 },
    { x: 36 * TILE + 8, y: 7 * TILE + 8, radius: 96, color: "#ffe6bd", flicker: 0 },
    { x: 4 * TILE, y: 2 * TILE, radius: 36, color: "#e8d24a", flicker: 0.14 },
  ]

  const seatId = (prefix: string, x: number, y: number) =>
    `${prefix}-${Math.floor(x / TILE)}-${Math.floor(y / TILE)}`

  const seats: Seat[] = []
  const addSeat = (
    prefix: string,
    x: number,
    y: number,
    facing: Seat["facing"],
    label: string,
    kind: SeatKind,
  ) => seats.push({ id: seatId(prefix, x, y), x, y, facing, label, kind })

  // Um assento por baia, os dois no corredor livre entre o par (ty+3): as
  // duas fileiras olham para baixo — nenhum avatar de costas para a câmera,
  // o problema que a planta anterior tinha (metade das baias olhava para cima).
  for (const tx of CUBICLE_COLS) {
    addSeat("ws", (tx + 1) * TILE, (TOP_TY + 3) * TILE + 4, "down", "Baia", "pc")
    addSeat("ws", (tx + 2) * TILE, (TOP_TY + 3) * TILE + 12, "down", "Baia", "pc")
  }

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
    // Spawn no hall, em frente ao elevador. `elevatorDoors` (h: 40px) grava
    // colisão até a linha 4 (ty 2..4): a linha 4 original caía dentro da porta,
    // então o spawn desce uma linha, para a 5 — ainda dentro do hall ladrilhado.
    spawn: { x: 4 * TILE, y: 5 * TILE },
  }
}
