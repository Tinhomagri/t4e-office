// Hit-test puro de hover: dado um ponto do mundo, acha o usuário sentado
// numa baia (kind "pc") mais próximo. Separado do engine.ts pra ficar
// testável sem canvas/mocks — engine.ts só embrulha isto com a conversão
// tela → mundo (mesma inversa iso que `clickTo` já faz).
export interface SeatedActor {
  id: string
  x: number
  y: number
  seatIndex: number
}

export function nearestSeatedUser(
  actors: SeatedActor[],
  seats: { kind: string }[],
  x: number,
  y: number,
  radius = 20,
): string | null {
  let best: string | null = null
  let bestDist = radius
  for (const actor of actors) {
    if (actor.seatIndex < 0) continue
    const seat = seats[actor.seatIndex]
    if (!seat || seat.kind !== "pc") continue
    const d = Math.hypot(actor.x - x, actor.y - y)
    if (d < bestDist) {
      bestDist = d
      best = actor.id
    }
  }
  return best
}
