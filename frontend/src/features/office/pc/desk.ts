// Qual mesa pertence a qual pessoa.
//
// Atribuição real, vinda do backend (tabela DeskAssignment) — o admin decide
// pelo manager de mesas (`DesksManagerPage`). Sem atribuição = mesa livre.
import type { Seat } from "../world/map"
import type { DeskAssignment } from "./desks.api"

/** Assentos com computador, em ordem estável (por id, não por construção). */
export function pcSeats(seats: Seat[]): Seat[] {
  return seats.filter((s) => s.kind === "pc").sort((a, b) => a.id.localeCompare(b.id))
}

/** A mesa é do `userId` segundo as atribuições vindas do backend? */
export function isMyDesk(
  userId: string,
  seat: Seat,
  assignments: DeskAssignment[],
): boolean {
  if (seat.kind !== "pc" || !userId) return false
  return assignments.some((a) => a.seat_id === seat.id && a.user_id === userId)
}
