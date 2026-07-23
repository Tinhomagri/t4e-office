// Planta do escritório: quatro ambientes conectados num andar único.
//
// O mapa é dado, não desenho: uma grade de tiles + lista de props + zonas +
// luzes. O renderizador não sabe o que é "copa"; só sabe pintar tile e prop.
// Assim dá para mexer na planta sem tocar em uma linha do motor.
import { PROPS, type PropKind } from "./props"
import { SOLID_TILES, T, TILE } from "./tiles"

export interface PlacedProp {
  kind: PropKind
  /** Canto superior esquerdo, em pixels do mundo. */
  x: number
  y: number
  /** Encosta na parede de cima: não recebe sombra de contato lateral. */
  flip?: boolean
}

export interface Zone {
  id: string
  label: string
  /** Retângulo em tiles. */
  x: number
  y: number
  w: number
  h: number
  /** Cor do rótulo flutuante. */
  accent: string
  hint: string
}

export interface LightSource {
  /** Centro em pixels do mundo. */
  x: number
  y: number
  radius: number
  color: string
  /** Oscilação sutil (0 = fixa). */
  flicker?: number
}

export interface Seat {
  /** Onde o avatar fica ao sentar (pés), em pixels do mundo. */
  x: number
  y: number
  facing: "up" | "down" | "left" | "right"
  label: string
}

export interface OfficeMap {
  cols: number
  rows: number
  width: number
  height: number
  floor: Uint8Array
  /** 1 = bloqueado. Inclui tiles sólidos e retângulos dos props. */
  collision: Uint8Array
  props: PlacedProp[]
  zones: Zone[]
  lights: LightSource[]
  seats: Seat[]
  /** Ponto de entrada padrão, em pixels. */
  spawn: { x: number; y: number }
}

const COLS = 60
const ROWS = 38

function idx(x: number, y: number): number {
  return y * COLS + x
}

function fill(
  grid: Uint8Array,
  x: number,
  y: number,
  w: number,
  h: number,
  value: number,
): void {
  for (let j = y; j < y + h; j++) {
    for (let i = x; i < x + w; i++) {
      if (i >= 0 && i < COLS && j >= 0 && j < ROWS) grid[idx(i, j)] = value
    }
  }
}

/** Paredes de um cômodo: contorno em WALL com o topo em WALL_TOP. */
function room(grid: Uint8Array, x: number, y: number, w: number, h: number, floor: number): void {
  fill(grid, x, y, w, h, floor)
  fill(grid, x, y, w, 1, T.WALL_TOP)
  fill(grid, x, y + 1, w, 1, T.WALL)
  fill(grid, x, y + h - 1, w, 1, T.WALL)
  // Laterais usam o tile vertical; a linha do topo continua sendo WALL_TOP.
  fill(grid, x, y + 1, 1, h - 1, T.WALL_V)
  fill(grid, x + w - 1, y + 1, 1, h - 1, T.WALL_V)
}

export function buildOfficeMap(): OfficeMap {
  const floor = new Uint8Array(COLS * ROWS).fill(T.VOID)

  // ── Casca do andar ────────────────────────────────────────────────────────
  room(floor, 0, 0, COLS, ROWS, T.WOOD)

  // Open space ocupa o miolo; os outros ambientes encostam nas bordas.
  fill(floor, 1, 2, COLS - 2, ROWS - 3, T.WOOD)

  // Sala de reunião (topo esquerdo) — carpete.
  room(floor, 2, 2, 22, 14, T.CARPET)
  fill(floor, 12, 15, 3, 1, T.DOORWAY) // porta para o open space

  // Copa (topo direito) — ladrilho.
  room(floor, 36, 2, 22, 12, T.TILEFLOOR)
  fill(floor, 44, 13, 3, 1, T.DOORWAY)

  // Área de foco (base esquerda) — carpete, cabines.
  room(floor, 2, 24, 18, 12, T.CARPET)
  fill(floor, 10, 24, 3, 1, T.DOORWAY)

  // Lounge social (base direita) — assoalho; o tapete é prop, não piso. Tile
  // de tapete repetido pelo cômodo inteiro vira estampa de papel de parede.
  room(floor, 38, 22, 20, 14, T.WOOD)
  fill(floor, 46, 22, 3, 1, T.DOORWAY)

  // Janelas: parede superior e a lateral direita do lounge.
  for (let x = 4; x < 20; x += 3) floor[idx(x, 2)] = T.WINDOW
  for (let x = 38; x < 56; x += 3) floor[idx(x, 2)] = T.WINDOW
  for (let x = 26; x < 34; x += 3) floor[idx(x, 1)] = T.WINDOW

  // ── Colisão ───────────────────────────────────────────────────────────────
  const collision = new Uint8Array(COLS * ROWS)
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      collision[idx(x, y)] = SOLID_TILES.has(floor[idx(x, y)]) ? 1 : 0
    }
  }

  // ── Móveis ────────────────────────────────────────────────────────────────
  const props: PlacedProp[] = []
  const add = (kind: PropKind, tx: number, ty: number, ox = 0, oy = 0) =>
    props.push({ kind, x: tx * TILE + ox, y: ty * TILE + oy })
  /** Posiciona em pixels — usado onde o móvel precisa encostar em outro. */
  const addPx = (kind: PropKind, x: number, y: number) => props.push({ kind, x, y })

  // Sala de reunião: mesa oval com as cadeiras ENCOSTADAS nela. Cadeira longe
  // da mesa é o detalhe que denuncia cenário montado no olho.
  addPx("meetingTable", 128, 128) // ocupa x128..208, y128..172
  for (const x of [138, 162, 186]) {
    addPx("chair", x, 112) // encosto some atrás do tampo
    addPx("chair", x, 166)
  }
  addPx("chair", 110, 138)
  addPx("chair", 208, 138)
  add("whiteboard", 5, 3)
  add("plant", 21, 3)
  add("plant", 3, 13)
  add("bookshelf", 19, 12)
  add("waterCooler", 3, 4)
  add("lamp", 21, 5) // encostada na parede — luminária solta no meio do piso
  //                    é o tipo de detalhe que entrega cenário montado

  // Open space: quatro ilhas de trabalho com divisórias.
  const islands: [number, number][] = [
    [26, 6],
    [30, 6],
    [26, 12],
    [30, 12],
  ]
  for (const [tx, ty] of islands) {
    add("deskIsland", tx, ty)
    add("chair", tx, ty + 3)
    add("chair", tx + 1, ty + 3)
  }
  // Divisória contínua entre as duas fileiras de ilhas. Painéis avulsos ficam
  // com cara de porta solta no meio da sala; em fileira, viram baia.
  for (let i = 0; i < 8; i++) add("partition", 26 + i, 10)
  add("bookshelf", 24, 18)
  add("plant", 34, 17)
  add("lamp", 34, 5)

  // Fileira de mesas individuais encostada na parede esquerda do open space.
  for (let i = 0; i < 3; i++) {
    add("desk", 4, 18 + i * 2)
    add("chair", 5, 20 + i * 2)
  }

  // Copa: cafeteira, bebedouro, balcão com banquetas e uma mesa.
  add("coffeeMachine", 38, 4)
  add("waterCooler", 41, 4)
  add("coffeeTable", 44, 6)
  add("chair", 44, 9)
  add("chair", 46, 9)
  add("plant", 55, 4)
  add("bookshelf", 50, 3)

  // Foco: cabines silenciosas, cada uma com divisória e planta.
  for (let i = 0; i < 3; i++) {
    add("desk", 4, 27 + i * 3)
    add("chair", 5, 29 + i * 3)
    add("partition", 8, 27 + i * 3)
  }
  add("plant", 17, 26)
  add("lamp", 17, 33)

  // Lounge: sofá, mesa de centro, arcade, tapete e verde.
  // Ordem importa: o tapete entra antes e com baseline 0, então fica sob o
  // sofá e a mesa de centro na ordenação por profundidade.
  addPx("rugRound", 672, 428) // encostado na base do sofá
  add("sofa", 42, 25)
  addPx("coffeeTable", 680, 438) // centralizado sobre o tapete
  add("arcade", 55, 24)
  add("arcade", 53, 24)
  add("plant", 39, 24)
  add("plant", 39, 33)
  add("bookshelf", 50, 33)

  // Props gravam colisão na grade — arredondando para o tile que ocupam.
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

  // Portas voltam a ser passáveis mesmo se um prop encostou nelas.
  const doorways: [number, number, number][] = [
    [12, 15, 3],
    [44, 13, 3],
    [10, 24, 3],
    [46, 22, 3],
  ]
  for (const [x, y, w] of doorways) fill(collision, x, y, w, 1, 0)

  // ── Zonas, luzes e assentos ───────────────────────────────────────────────
  const zones: Zone[] = [
    {
      id: "meeting",
      label: "Sala de reunião",
      x: 3, y: 3, w: 20, h: 12,
      accent: "#4a6fa5",
      hint: "Entrou em reunião",
    },
    {
      id: "focus",
      label: "Área de foco",
      x: 3, y: 25, w: 16, h: 10,
      accent: "#7a6ba0",
      hint: "Modo foco — silêncio",
    },
    {
      id: "kitchen",
      label: "Copa",
      x: 37, y: 3, w: 20, h: 10,
      accent: "#c9a04a",
      hint: "Pausa para o café",
    },
    {
      id: "lounge",
      label: "Lounge",
      x: 39, y: 23, w: 18, h: 12,
      accent: "#a55f4e",
      hint: "Social — dá para jogar",
    },
    {
      id: "openspace",
      label: "Open space",
      x: 22, y: 4, w: 14, h: 16,
      accent: "#5d8a52",
      hint: "Estação de trabalho",
    },
  ]

  const lights: LightSource[] = [
    // Cada luminária tem sua luz — as coordenadas seguem os props "lamp".
    { x: 34 * TILE + 8, y: 5 * TILE + 8, radius: 74, color: "#ffd9a0", flicker: 0 },
    { x: 21 * TILE + 8, y: 5 * TILE + 8, radius: 74, color: "#ffd9a0", flicker: 0 },
    { x: 17 * TILE + 8, y: 33 * TILE + 8, radius: 74, color: "#ffd9a0", flicker: 0 },
    { x: 14 * TILE, y: 9 * TILE, radius: 120, color: "#ffe6bd", flicker: 0 },
    { x: 46 * TILE, y: 8 * TILE, radius: 110, color: "#ffe0b0", flicker: 0 },
    { x: 48 * TILE, y: 29 * TILE, radius: 130, color: "#ffcf9a", flicker: 0 },
    // Telas e arcade piscam de leve — o único movimento na camada de luz.
    { x: 54 * TILE + 8, y: 26 * TILE, radius: 46, color: "#c07ad9", flicker: 0.16 },
    { x: 56 * TILE + 8, y: 26 * TILE, radius: 46, color: "#7ab2d9", flicker: 0.2 },
    { x: 39 * TILE, y: 6 * TILE, radius: 40, color: "#8fd9b5", flicker: 0.1 },
  ]

  const seats: Seat[] = []
  for (const [tx, ty] of islands) {
    seats.push({ x: tx * TILE + 8, y: (ty + 3) * TILE + 14, facing: "up", label: "Estação de trabalho" })
    seats.push({ x: (tx + 1) * TILE + 8, y: (ty + 3) * TILE + 14, facing: "up", label: "Estação de trabalho" })
  }
  for (let i = 0; i < 3; i++) {
    seats.push({ x: 5 * TILE + 8, y: (20 + i * 2) * TILE + 14, facing: "up", label: "Mesa individual" })
    seats.push({ x: 5 * TILE + 8, y: (29 + i * 3) * TILE + 14, facing: "up", label: "Cabine de foco" })
  }
  for (let i = 0; i < 3; i++) {
    seats.push({ x: (8 + i * 2) * TILE + 8, y: 7 * TILE + 14, facing: "down", label: "Sala de reunião" })
    seats.push({ x: (8 + i * 2) * TILE + 8, y: 12 * TILE + 14, facing: "up", label: "Sala de reunião" })
  }
  seats.push({ x: 43 * TILE, y: 27 * TILE, facing: "down", label: "Sofá do lounge" })
  seats.push({ x: 46 * TILE, y: 27 * TILE, facing: "down", label: "Sofá do lounge" })
  seats.push({ x: 44 * TILE + 8, y: 10 * TILE + 14, facing: "up", label: "Mesa da copa" })
  seats.push({ x: 46 * TILE + 8, y: 10 * TILE + 14, facing: "up", label: "Mesa da copa" })

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
    spawn: { x: 29 * TILE, y: 21 * TILE },
  }
}

/** Zona que contém um ponto do mundo (em pixels), se houver. */
export function zoneAt(map: OfficeMap, x: number, y: number): Zone | null {
  const tx = Math.floor(x / TILE)
  const ty = Math.floor(y / TILE)
  for (const z of map.zones) {
    if (tx >= z.x && tx < z.x + z.w && ty >= z.y && ty < z.y + z.h) return z
  }
  return null
}

/** Colisão em coordenadas de mundo (pixels). */
export function isSolid(map: OfficeMap, x: number, y: number): boolean {
  const tx = Math.floor(x / TILE)
  const ty = Math.floor(y / TILE)
  if (tx < 0 || ty < 0 || tx >= map.cols || ty >= map.rows) return true
  return map.collision[ty * map.cols + tx] === 1
}
