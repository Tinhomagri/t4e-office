// Tipos e consultas da planta de um andar.
//
// A planta em si mora em `floors/` — este arquivo não constrói mapa nenhum. O
// motor lê `OfficeMap` e não sabe qual andar está desenhando.
import { TILE } from "./tiles"
import type { PropKind } from "./props"

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

/** "pc" tem computador; "view" é o guarda-corpo da varanda; "poker" é a mesa
 * em U do andar 2 — sentar entra na sessão de Planning Poker ativa. */
export type SeatKind = "pc" | "meeting" | "lounge" | "view" | "poker"

export interface Seat {
  /**
   * Identificador estável, derivado do tile — não do índice do array. Índice
   * quebraria na primeira mudança de planta, e a mesa pessoal precisa persistir.
   */
  id: string
  /** Onde o avatar fica ao sentar (pés), em pixels do mundo. */
  x: number
  y: number
  facing: "up" | "down" | "left" | "right"
  label: string
  /** "pc" tem computador; só nesses o desktop pode abrir. */
  kind: SeatKind
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
