// Assentos falsos para inspecionar a proporção da mesa cheia sem precisar de
// 10 pessoas (e 10 webcams) de verdade. Ligado só por `?mockseats=N` na URL da
// sala; sem o parâmetro nada disto é montado e a sala segue normal.
import { randomAvatar } from "@/features/avatar/avatar.random"
import type { PokerParticipant } from "./poker.types"

export const MOCK_SEAT_PREFIX = "mock-seat-"

const NAMES = [
  "Ana",
  "Bruno",
  "Carla",
  "Diego",
  "Elisa",
  "Felipe",
  "Gabi",
  "Henrique",
  "Iara",
  "Jonas",
]

export function isMockSeat(userId: string): boolean {
  return userId.startsWith(MOCK_SEAT_PREFIX)
}

/** Lê `?mockseats=N` (0 = desligado). Teto de 10 = SEATS_MAX da mesa. */
export function mockSeatCount(search: string): number {
  const raw = Number(new URLSearchParams(search).get("mockseats"))
  return Number.isFinite(raw) ? Math.max(0, Math.min(10, Math.trunc(raw))) : 0
}

export function makeMockParticipants(count: number): PokerParticipant[] {
  return Array.from({ length: count }, (_, i) => {
    const name = NAMES[i % NAMES.length]
    return {
      id: `${MOCK_SEAT_PREFIX}${i}`,
      user_id: `${MOCK_SEAT_PREFIX}${i}`,
      user_name: name,
      avatar_initials: name.slice(0, 2).toUpperCase(),
      is_host: false,
      avatar_config: randomAvatar(i + 1, name),
    }
  })
}
