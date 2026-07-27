// Qual mesa pertence a qual pessoa.
//
// Nesta fatia a mesa é derivada do id do usuário: determinístico, sem migration
// e sem endpoint. A fatia 2 substitui o corpo destas três funções por uma
// consulta ao backend (tabela DeskAssignment) sem que o window manager saiba.
//
// Limite conhecido e aceito: com mais gente que mesa, duas pessoas resolvem para
// a mesma mesa. A UI não promete exclusividade enquanto isso não vier do banco.
import type { Seat } from "../world/map"

/** FNV-1a 32 bits: barato, estável entre execuções e bem espalhado. */
function hash(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Assentos com computador, em ordem estável (por id, não por construção). */
export function pcSeats(seats: Seat[]): Seat[] {
  return seats.filter((s) => s.kind === "pc").sort((a, b) => a.id.localeCompare(b.id))
}

export function myDeskId(userId: string, seats: Seat[]): string | null {
  if (!userId) return null
  const pool = pcSeats(seats)
  if (pool.length === 0) return null
  return pool[hash(userId) % pool.length].id
}

export function isMyDesk(userId: string, seat: Seat, seats: Seat[]): boolean {
  if (seat.kind !== "pc") return false
  return myDeskId(userId, seats) === seat.id
}
