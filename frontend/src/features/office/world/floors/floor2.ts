// Andar 2 — sala de Planning Poker.
//
// Mesa em U que abre para o hall/elevador ao norte, 16 assentos ao redor,
// telão na parede sul e um console perto da entrada onde o host controla a
// sessão. Todo assento olha para baixo — mesma regra do andar 1: nenhum
// avatar de costas para a câmera.
import type { LightSource, OfficeMap, PlacedProp, Seat, SeatKind, Zone } from "../map"
import { PROPS, type PropKind } from "../props"
import { SOLID_TILES, T, TILE } from "../tiles"

const COLS = 26
const ROWS = 17

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

function room(grid: Uint8Array, x: number, y: number, w: number, h: number, floor: number): void {
  fill(grid, x, y, w, h, floor)
  fill(grid, x, y, w, 1, T.WALL_TOP)
  fill(grid, x, y + 1, w, 1, T.WALL)
  fill(grid, x, y + h - 1, w, 1, T.WALL)
  fill(grid, x, y + 1, 1, h - 1, T.WALL_V)
  fill(grid, x + w - 1, y + 1, 1, h - 1, T.WALL_V)
}

export function buildFloor2(): OfficeMap {
  const floor = new Uint8Array(COLS * ROWS).fill(T.VOID)

  room(floor, 0, 0, COLS, ROWS, T.WOOD)
  fill(floor, 1, 1, 6, 6, T.TILEFLOOR)

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
  add("pokerConsole", 8, 2)
  add("pokerTable", 6, 6)
  add("pokerScreen", 10, 14)
  add("plant", 24, 2)
  add("plant", 24, 13)

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
      id: "poker-console",
      label: "Console",
      x: 6, y: 1, w: 4, h: 4,
      accent: "#c9a04a",
      hint: "Aperte E para abrir o painel do host",
    },
    {
      id: "poker-room",
      label: "Planning Poker",
      x: 0, y: 0, w: COLS, h: ROWS,
      accent: "#6c5cf0",
      hint: "Sente-se para entrar na rodada",
    },
  ]

  const lights: LightSource[] = [
    { x: 13 * TILE, y: 9 * TILE, radius: 130, color: "#e6ddff", flicker: 0 },
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

  // Base do U, entre a mesa e o telão.
  for (const tx of [6, 8, 10, 12, 14, 16, 18, 20]) {
    addSeat("pk", tx * TILE, 13 * TILE, "down", "Planning Poker", "poker")
  }
  // Braço oeste da mesa.
  for (const ty of [5, 7, 9, 11]) {
    addSeat("pk", 4 * TILE, ty * TILE, "down", "Planning Poker", "poker")
  }
  // Braço leste da mesa.
  for (const ty of [5, 7, 9, 11]) {
    addSeat("pk", 22 * TILE, ty * TILE, "down", "Planning Poker", "poker")
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
    // `elevatorDoors` (h: 40px) grava pela linha 4 (mesmo padrão do andar 1),
    // então o spawn desce uma linha, para a 5 — ainda dentro do hall.
    spawn: { x: 4 * TILE, y: 5 * TILE },
  }
}
