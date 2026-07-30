import { describe, expect, it } from "vitest"

import { buildFloor1 } from "./floors/floor1"
import { seatIndexAt } from "./map"

const map = buildFloor1()

describe("assentos", () => {
  it("todo assento tem id único", () => {
    const ids = map.seats.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("preserva ids estáveis para atribuições de mesa", () => {
    // A primeira fileira manteve seu id histórico mesmo após o alinhamento
    // visual da cadeira com a fileira de baixo.
    expect(map.seats.some((s) => s.id === "ws-9-4")).toBe(true)
    expect(map.seats.some((s) => s.id === "ws-10-10")).toBe(true)
  })

  it("alinha as cadeiras das duas fileiras na mesma coluna visual", () => {
    expect(map.seats[0]!.x).toBe(map.seats[1]!.x)
  })

  it("baias são kind 'pc' — 30 no total", () => {
    const pc = map.seats.filter((s) => s.kind === "pc")
    expect(pc).toHaveLength(30)
    for (const s of pc) expect(s.id.startsWith("ws-")).toBe(true)
  })

  it("não há assento 'view' de varanda — bullpen compacto não tem varanda", () => {
    const view = map.seats.filter((s) => s.kind === "view")
    expect(view).toHaveLength(0)
  })

  it("todo assento está dentro dos limites do mapa", () => {
    for (const seat of map.seats) {
      expect(seat.x).toBeGreaterThan(0)
      expect(seat.y).toBeGreaterThan(0)
      expect(seat.x).toBeLessThan(map.width)
      expect(seat.y).toBeLessThan(map.height)
    }
  })

  it("reconhece um avatar encaixado na cadeira", () => {
    const seat = map.seats[0]!
    expect(seatIndexAt(map, seat.x, seat.y)).toBe(0)
    expect(seatIndexAt(map, seat.x + 5, seat.y)).toBe(-1)
  })

  it("desenha a pessoa sentada dentro da cadeira, olhando para o monitor", () => {
    const seat = map.seats[0]!
    expect(seat.facing).toBe("up")
    expect(seat.visualOffset).toEqual({ x: -5, y: -31 })
  })

  it("todo assento é alcançável a pé", () => {
    // O tile do assento é sólido de propósito — é a cadeira, e cadeira atravessável
    // seria pior. O que precisa valer é existir chão livre dentro do raio de
    // interação (26px, engine.ts:298), senão a cadeira fica inacessível.
    for (const seat of map.seats) {
      const tx = Math.floor(seat.x / 16)
      const ty = Math.floor(seat.y / 16)
      let alcancavel = false
      for (let dy = -2; dy <= 2 && !alcancavel; dy++) {
        for (let dx = -2; dx <= 2 && !alcancavel; dx++) {
          const x = tx + dx
          const y = ty + dy
          if (x < 0 || y < 0 || x >= map.cols || y >= map.rows) continue
          if (map.collision[y * map.cols + x] !== 0) continue
          if (Math.hypot(x * 16 + 8 - seat.x, y * 16 + 8 - seat.y) <= 26) alcancavel = true
        }
      }
      expect(alcancavel, `assento ${seat.id} está inacessível`).toBe(true)
    }
  })
})
