// Hit-test puro de hover: dado um ponto do mundo, acha o usuário sentado
// numa baia (kind "pc") mais próximo. Separado do engine.ts pra ficar
// testável sem canvas/mocks — engine.ts só embrulha isto com a conversão
// tela → mundo (mesma inversa iso que `clickTo` já faz).
export interface PositionedActor {
  id: string
  x: number
  y: number
}

export interface HoverableSeat {
  x: number
  y: number
  kind: string
}

/**
 * Usuário sentado numa baia (seat kind "pc") perto do ponto dado. Sentar
 * encosta a posição do avatar EXATAMENTE na do assento (local ou remoto —
 * ver tryInteract/updateRemotes em engine.ts), então "sentado" aqui é
 * detectado por proximidade de posição a um assento "pc", não por
 * `actor.seatIndex` — esse campo só existe pro avatar local (`me`), nunca
 * pros avatares remotos sincronizados via presença (sem campo de assento
 * no HeartbeatView/PresenceModel). Checar por seatIndex faria o hover nunca
 * detectar um colega de verdade sentado, só o próprio usuário.
 */
export function nearestSeatedUser(
  actors: PositionedActor[],
  seats: HoverableSeat[],
  x: number,
  y: number,
  hoverRadius = 20,
  seatSnapRadius = 4,
): string | null {
  const pcSeats = seats.filter((s) => s.kind === "pc")
  let best: string | null = null
  let bestDist = hoverRadius
  for (const actor of actors) {
    const seated = pcSeats.some(
      (seat) => Math.hypot(actor.x - seat.x, actor.y - seat.y) <= seatSnapRadius,
    )
    if (!seated) continue
    const d = Math.hypot(actor.x - x, actor.y - y)
    if (d < bestDist) {
      bestDist = d
      best = actor.id
    }
  }
  return best
}
