import type { Direction } from "@/features/avatar/avatar.types"

// Direção que o avatar deve encarar dado um vetor de deslocamento.
// Eixo dominante vence (movimento mais horizontal → left/right).
export function facingFromDelta(dx: number, dy: number): Direction {
  if (dx === 0 && dy === 0) return "down"
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? "right" : "left"
  return dy > 0 ? "down" : "up"
}

// Mantém coordenadas normalizadas dentro de [0, 1].
export function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}
