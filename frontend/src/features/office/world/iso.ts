// Projeção isométrica (mundo cartesiano → tela em losango) e sua inversa.
//
// Física, colisão e posição de atores continuam em espaço de mundo cartesiano
// (pixels, TILE=16) — só a camada de desenho passa por aqui. Ver MASTER.md.
import { TILE } from "./tiles"

/** Largura/altura do losango de piso, em px de tela, na escala 1×. */
export const ISO_TILE_W = 32
export const ISO_TILE_H = 16

/** Fatores aplicados sobre coordenadas de mundo em pixels (já embutem TILE). */
export const ISO_FX = ISO_TILE_W / TILE / 2
export const ISO_FY = ISO_TILE_H / TILE / 2

/** Mundo (pixels cartesianos) → tela (losango isométrico), antes do offset de origem. */
export function worldToIso(x: number, y: number): { x: number; y: number } {
  return { x: (x - y) * ISO_FX, y: (x + y) * ISO_FY }
}

/** Inversa: tela isométrica → mundo cartesiano. Usada no clique-pra-andar. */
export function isoToWorld(ix: number, iy: number): { x: number; y: number } {
  const x = ix / (2 * ISO_FX) + iy / (2 * ISO_FY)
  const y = iy / (2 * ISO_FY) - ix / (2 * ISO_FX)
  return { x, y }
}

/**
 * Tamanho do retângulo que contém o mapa inteiro já projetado em losango
 * (origem no vértice esquerdo do losango, ou seja, tile (0, rows-1)).
 * `wallHeight` soma folga vertical para a parede "subir" acima do piso.
 */
export function isoMapSize(
  cols: number,
  rows: number,
  wallHeight = 0,
): { w: number; h: number } {
  const worldW = cols * TILE
  const worldH = rows * TILE
  return {
    w: (worldW + worldH) * ISO_FX,
    h: (worldW + worldH) * ISO_FY + wallHeight,
  }
}

/**
 * Deslocamento a somar em `worldToIso(x, y)` para que o mapa inteiro caiba no
 * retângulo de `isoMapSize`, com origem em (0, 0) no canto superior.
 */
export function isoOrigin(_cols: number, rows: number): { x: number; y: number } {
  const worldH = rows * TILE
  // O ponto mais à esquerda do losango é (0, worldH): x projetado = -worldH*ISO_FX.
  return { x: worldH * ISO_FX, y: 0 }
}
