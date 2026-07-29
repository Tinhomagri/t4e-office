import { describe, expect, it } from "vitest"

import type { DeskAssignment } from "./desks.api"
import { buildFloor1 } from "../world/floors/floor1"
import { isMyDesk, pcSeats } from "./desk"

const map = buildFloor1()

describe("pcSeats", () => {
  it("devolve só assentos com computador", () => {
    const seats = pcSeats(map.seats)
    expect(seats).toHaveLength(30)
    for (const s of seats) expect(s.kind).toBe("pc")
  })

  it("ordena por id — a ordem não pode depender da construção do mapa", () => {
    const ids = pcSeats(map.seats).map((s) => s.id)
    expect(ids).toEqual([...ids].sort())
  })

  it("ordem estável mesmo se a lista de entrada vier embaralhada", () => {
    const shuffled = [...map.seats].reverse()
    expect(pcSeats(shuffled).map((s) => s.id)).toEqual(pcSeats(map.seats).map((s) => s.id))
  })
})

describe("isMyDesk", () => {
  const seat = pcSeats(map.seats)[0]
  const assignments: DeskAssignment[] = [
    { seat_id: seat.id, floor: 1, user_id: "ana-123", user_name: "Ana" },
  ]

  it("verdadeiro quando a atribuição bate com o assento e o usuário", () => {
    expect(isMyDesk("ana-123", seat, assignments)).toBe(true)
  })

  it("falso pra outro usuário na mesma mesa", () => {
    expect(isMyDesk("bob-456", seat, assignments)).toBe(false)
  })

  it("falso pra mesa sem atribuição nenhuma", () => {
    const outra = pcSeats(map.seats)[1]
    expect(isMyDesk("ana-123", outra, assignments)).toBe(false)
  })

  it("falso para assento sem computador — a mesa de poker nunca liga PC", () => {
    const naoP = map.seats.find((s) => s.kind !== "pc")
    if (naoP) expect(isMyDesk("ana-123", naoP, assignments)).toBe(false)
  })

  it("id de usuário vazio nunca é dono de nada", () => {
    expect(isMyDesk("", seat, assignments)).toBe(false)
  })
})
