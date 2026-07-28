// Matemática de câmera e escala, separada do motor.
//
// Vive fora da OfficeEngine por um motivo prático: jsdom não tem canvas, então a
// engine não pode ser instanciada em teste. Aqui é função pura — dá para provar
// que a escala nunca fica fracionária e que a câmera nunca mostra o vazio.

/** Escala de exibição. Sempre inteira; fracionária faz o pixel-art tremer. */
export function integerScale(cssW: number, cssH: number, max = 4): number {
  // Base 480×300 (mesma proporção 1.6 da antiga 320×200, só maior): em uma
  // tela de 1200×800 a escala cai de 3× para 2×, quase dobrando os tiles
  // visíveis por vez. É o ajuste que tira a sensação de câmera colada no
  // personagem.
  const fit = Math.min(cssW / 480, cssH / 300)
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

/** Quanto a câmera abre para fora quando o avatar se apoia no guarda-corpo. */
export const VIEW_OFFSET_PX = 40

/** Direção em que a câmera abre, a partir do lado para onde o avatar olha. */
export function viewOffsetFor(facing: "up" | "down" | "left" | "right"): {
  dx: number
  dy: number
} {
  switch (facing) {
    case "up": return { dx: 0, dy: -VIEW_OFFSET_PX }
    case "down": return { dx: 0, dy: VIEW_OFFSET_PX }
    case "left": return { dx: -VIEW_OFFSET_PX, dy: 0 }
    default: return { dx: VIEW_OFFSET_PX, dy: 0 }
  }
}

/**
 * Soma um offset ao alvo da câmera e reaplica o clamp de borda. É o clamp que
 * impede o offset de mostrar a faixa preta fora do andar.
 */
export function offsetCamera(
  target: { x: number; y: number },
  dx: number,
  dy: number,
  viewW: number,
  viewH: number,
  mapW: number,
  mapH: number,
): { x: number; y: number } {
  const maxX = Math.max(0, mapW - viewW)
  const maxY = Math.max(0, mapH - viewH)
  return {
    x: Math.max(0, Math.min(maxX, target.x + dx)),
    y: Math.max(0, Math.min(maxY, target.y + dy)),
  }
}
