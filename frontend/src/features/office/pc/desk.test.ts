import { describe, expect, it } from "vitest"

import { buildFloor1 } from "../world/floors/floor1"
import { buildFloor2 } from "../world/floors/floor2"
import { isMyDesk, myDeskId, pcSeats } from "./desk"

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

describe("myDeskId", () => {
  it("é determinístico — a mesma pessoa cai sempre na mesma mesa", () => {
    const id = myDeskId("d29b35ed-0895-4355-9148-d48fe14b4940", map.seats)
    for (let i = 0; i < 20; i++) {
      expect(myDeskId("d29b35ed-0895-4355-9148-d48fe14b4940", map.seats)).toBe(id)
    }
  })

  it("resolve para um assento que existe e tem computador", () => {
    const id = myDeskId("qualquer-usuario", map.seats)
    const seat = map.seats.find((s) => s.id === id)
    expect(seat).toBeDefined()
    expect(seat?.kind).toBe("pc")
  })

  it("usuários diferentes se espalham pelas mesas — não colapsa numa só", () => {
    const ids = new Set(
      Array.from({ length: 200 }, (_, i) => myDeskId(`user-${i}`, map.seats)),
    )
    expect(ids.size).toBeGreaterThan(8)
  })

  it("sem assento com computador, devolve null", () => {
    const semPc = map.seats.filter((s) => s.kind !== "pc")
    expect(myDeskId("alguem", semPc)).toBeNull()
  })

  it("id de usuário vazio devolve null — sem sessão, sem mesa", () => {
    expect(myDeskId("", map.seats)).toBeNull()
  })
})

describe("isMyDesk", () => {
  it("verdadeiro só para o assento resolvido", () => {
    const userId = "ana-123"
    const mine = map.seats.find((s) => s.id === myDeskId(userId, map.seats))!
    expect(isMyDesk(userId, mine, map.seats)).toBe(true)

    const outra = pcSeats(map.seats).find((s) => s.id !== mine.id)!
    expect(isMyDesk(userId, outra, map.seats)).toBe(false)
  })

  it("falso para assento sem computador — a mesa de poker nunca liga PC", () => {
    // O bullpen só tem assentos "pc"; o andar 2 fornece o assento "poker"
    // necessário para provar o caso negativo de verdade.
    const poker = buildFloor2().seats.find((s) => s.kind === "poker")!
    expect(poker).toBeDefined()
    expect(isMyDesk("ana-123", poker, map.seats)).toBe(false)
  })
})
