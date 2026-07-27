// Andar 1 — bullpen.
//
// Galpão de trabalho único, no espírito de The Office: duas fileiras de baias
// em U em pares encostados de costas, hall do elevador a oeste e fachada de
// vidro em L (sul e leste) do piso ao teto. A varanda em deck fecha a quina
// sudeste, e o que está fora do envelope do prédio é T.VOID — ali só se vê a
// camada de céu.
//
// A planta é dado, não desenho: o motor lê tile, prop, zona, luz e assento sem
// saber o que é "baia".
import type { LightSource, OfficeMap, PlacedProp, Seat, SeatKind, Zone } from "../map"
import { PROPS, type PropKind } from "../props"
import { SOLID_TILES, T, TILE } from "../tiles"

const COLS = 72
const ROWS = 46

// Envelope do prédio. Fora daqui é céu.
const B = { x: 0, y: 0, w: 56, h: 38 }

// Deck em L, fechando a quina sudeste.
const DECK_S = { x: 20, y: 38, w: 36, h: 6 }
const DECK_E = { x: 56, y: 20, w: 8, h: 24 }

// Porta de vidro na fachada sul.
const DOOR = { x: 28, w: 3 }

// Clusters de baia: 2 fileiras × 4 colunas, passo 8 em x e 14 em y.
const CUBICLE_COLS = [16, 24, 32, 40]
const CUBICLE_ROWS = [6, 20]

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

  // ── Envelope ──────────────────────────────────────────────────────────────
  room(floor, B.x, B.y, B.w, B.h, T.WOOD)

  // Hall do elevador: ladrilho, encostado na parede oeste.
  fill(floor, 1, 2, 10, 12, T.TILEFLOOR)

  // Fachada de vidro sul (do piso ao teto) com a porta no meio.
  fill(floor, 6, B.h - 1, 48, 1, T.GLASS)
  fill(floor, DOOR.x, B.h - 1, DOOR.w, 1, T.GLASS_DOOR)

  // Fachada de vidro leste.
  fill(floor, B.w - 1, 4, 1, 32, T.GLASS)

  // ── Varanda ───────────────────────────────────────────────────────────────
  fill(floor, DECK_S.x, DECK_S.y, DECK_S.w, DECK_S.h, T.DECK)
  fill(floor, DECK_E.x, DECK_E.y, DECK_E.w, DECK_E.h, T.DECK)

  // Guarda-corpo em todo o perímetro externo do deck. Fazer isto por varredura,
  // e não à mão, é o que garante que não sobra vão para cair — testado.
  const isDeck = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < COLS && y < ROWS && floor[idx(x, y)] === T.DECK
  const railing: [number, number][] = []
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (!isDeck(x, y)) continue
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx
        const ny = y + dy
        const fora =
          nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS || floor[idx(nx, ny)] === T.VOID
        if (fora) railing.push([nx, ny])
      }
    }
  }
  for (const [x, y] of railing) {
    if (x >= 0 && y >= 0 && x < COLS && y < ROWS) floor[idx(x, y)] = T.RAILING
  }

  // ── Colisão a partir do tile ──────────────────────────────────────────────
  const collision = new Uint8Array(COLS * ROWS)
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      collision[idx(x, y)] = SOLID_TILES.has(floor[idx(x, y)]) ? 1 : 0
    }
  }

  // ── Móveis ────────────────────────────────────────────────────────────────
  const props: PlacedProp[] = []
  const add = (kind: PropKind, tx: number, ty: number) =>
    props.push({ kind, x: tx * TILE, y: ty * TILE })

  // Baias: cada cluster são duas baias de costas. `cubicle` (3 tiles de
  // altura, colisão de 34px) ocupa as linhas [ty, ty+3) inteiras — o
  // arredondamento do retângulo de colisão para a grade consome a linha
  // toda, então a "abertura ao sul" é o corredor FORA do retângulo do prop,
  // não uma fresta dentro dele. Por isso a `cubicleFlip` de baixo começa em
  // ty+4, não ty+3: a linha ty+3 fica livre como corredor único,
  // compartilhado pelas duas baias (uma olha para cima, a outra para baixo).
  for (const ty of CUBICLE_ROWS) {
    for (const tx of CUBICLE_COLS) {
      add("cubicle", tx, ty)
      add("cubicleFlip", tx, ty + 4)
    }
  }

  // Hall e recepção.
  add("elevatorDoors", 2, 2)
  add("receptionDesk", 7, 7)
  add("coatRack", 1, 11)
  add("noticeBoard", 8, 2)

  // Serviço do bullpen, encostado nas paredes.
  add("copier", 50, 3)
  add("filingCabinet", 49, 6)
  add("filingCabinet", 50, 6)
  add("waterCooler", 13, 3)
  add("plant", 12, 34)
  add("plant", 52, 33)
  add("plant", 14, 16)
  add("bookshelf", 47, 33)
  add("lamp", 30, 3)
  add("lamp", 30, 33)

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

  // A porta de vidro volta a ser passável mesmo se um prop encostou nela.
  fill(collision, DOOR.x, B.h - 1, DOOR.w, 1, 0)

  // ── Zonas ─────────────────────────────────────────────────────────────────
  const zones: Zone[] = [
    {
      id: "elevator",
      label: "Elevador",
      x: 2, y: 2, w: 4, h: 4,
      accent: "#8a93a0",
      hint: "Aperte E para escolher o andar",
    },
    {
      id: "reception",
      label: "Recepção",
      x: 6, y: 6, w: 6, h: 6,
      accent: "#c9a04a",
      hint: "Entrada do andar",
    },
    {
      id: "bullpen",
      label: "Bullpen",
      x: 13, y: 2, w: 40, h: 34,
      accent: "#5d8a52",
      hint: "Estação de trabalho",
    },
    {
      id: "terrace",
      label: "Varanda",
      x: DECK_S.x, y: DECK_S.y, w: DECK_S.w, h: DECK_S.h,
      accent: "#4a90a8",
      hint: "Ar fresco — E para olhar a vista",
    },
  ]

  // ── Luzes ─────────────────────────────────────────────────────────────────
  const lights: LightSource[] = [
    { x: 30 * TILE + 8, y: 3 * TILE + 8, radius: 96, color: "#ffe6bd", flicker: 0 },
    { x: 30 * TILE + 8, y: 33 * TILE + 8, radius: 96, color: "#ffe6bd", flicker: 0 },
    { x: 6 * TILE, y: 8 * TILE, radius: 110, color: "#ffe0b0", flicker: 0 },
    // Luz fria entrando pelas duas fachadas de vidro.
    { x: 30 * TILE, y: 36 * TILE, radius: 150, color: "#cfe0ea", flicker: 0 },
    { x: 54 * TILE, y: 20 * TILE, radius: 140, color: "#cfe0ea", flicker: 0 },
    // Indicador do elevador pisca de leve.
    { x: 4 * TILE, y: 2 * TILE, radius: 36, color: "#e8d24a", flicker: 0.14 },
  ]

  // ── Assentos ──────────────────────────────────────────────────────────────
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

  // Um assento por baia, os dois no corredor livre entre o par (ty+3): a
  // cadeira da baia de cima fica encostada no lado norte do corredor,
  // olhando para cima (para a mesa); a de baixo, encostada no lado sul,
  // olhando para baixo. Colunas diferentes (tx+1 e tx+2) — o id do assento
  // deriva do tile, então duas cadeiras no mesmo tile colidiriam de id.
  for (const ty of CUBICLE_ROWS) {
    for (const tx of CUBICLE_COLS) {
      addSeat("ws", (tx + 1) * TILE, (ty + 3) * TILE + 4, "up", "Baia", "pc")
      addSeat("ws", (tx + 2) * TILE, (ty + 3) * TILE + 12, "down", "Baia", "pc")
    }
  }

  // Guarda-corpo: assentos de vista espalhados pelo deck sul e pelo leste.
  for (const tx of [24, 30, 36, 44]) {
    addSeat("vw", tx * TILE + 8, (DECK_S.y + DECK_S.h - 1) * TILE, "down", "Vista da varanda", "view")
  }
  for (const ty of [26, 34]) {
    addSeat("vw", (DECK_E.x + DECK_E.w - 1) * TILE, ty * TILE + 8, "right", "Vista da varanda", "view")
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
    // Spawn no hall, em frente ao elevador.
    spawn: { x: 8 * TILE, y: 4 * TILE },
  }
}
