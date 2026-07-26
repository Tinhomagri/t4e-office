// Matemática de câmera e escala, separada do motor.
//
// Vive fora da OfficeEngine por um motivo prático: jsdom não tem canvas, então a
// engine não pode ser instanciada em teste. Aqui é função pura — dá para provar
// que a escala nunca fica fracionária e que a câmera nunca mostra o vazio.

/** Escala de exibição. Sempre inteira; fracionária faz o pixel-art tremer. */
export function integerScale(cssW: number, cssH: number, max = 4): number {
  const fit = Math.min(cssW / 320, cssH / 200)
  return Math.max(2, Math.min(max, Math.floor(fit)))
}

/** Quantos pixels de mundo cabem na tela, dada a escala. */
export function viewportFor(
  cssW: number,
  cssH: number,
  scale: number,
): { viewW: number; viewH: number } {
  return { viewW: Math.ceil(cssW / scale), viewH: Math.ceil(cssH / scale) }
}

export function worldToScreen(
  camX: number,
  camY: number,
  scale: number,
  x: number,
  y: number,
): { x: number; y: number } {
  return { x: (x - camX) * scale, y: (y - camY) * scale }
}

export function screenToWorld(
  camX: number,
  camY: number,
  scale: number,
  sx: number,
  sy: number,
): { x: number; y: number } {
  return { x: camX + sx / scale, y: camY + sy / scale }
}

/**
 * Canto da câmera para centralizar (cx, cy), travado nas bordas do mapa —
 * é o clamp que evita a faixa preta de fora do andar.
 */
export function cameraTarget(
  cx: number,
  cy: number,
  viewW: number,
  viewH: number,
  mapW: number,
  mapH: number,
): { x: number; y: number } {
  const maxX = Math.max(0, mapW - viewW)
  const maxY = Math.max(0, mapH - viewH)
  return {
    x: Math.max(0, Math.min(maxX, cx - viewW / 2)),
    y: Math.max(0, Math.min(maxY, cy - viewH / 2)),
  }
}

/** Teto de escala sob foco. Acima disso a viewport vira dois pixels de mundo. */
export const FOCUS_MAX = 8

/**
 * Escala com a câmera travada: nunca menor que a escala normal daquela tela,
 * nunca maior que FOCUS_MAX, sempre inteira.
 */
export function focusScale(cssW: number, cssH: number, zoom: number): number {
  const base = integerScale(cssW, cssH, FOCUS_MAX)
  return Math.max(base, Math.min(FOCUS_MAX, Math.round(zoom)))
}
