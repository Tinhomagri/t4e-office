import { describe, expect, it } from "vitest"

import { buildFloor1 } from "./floors/floor1"

const map = buildFloor1()

describe("assentos", () => {
  it("todo assento tem id único", () => {
    const ids = map.seats.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("id deriva do tile do assento, não do índice do array", () => {
    // Primeira baia, coluna 8: a cadeira do lado "cubicle" cai no tile (9,4),
    // a do lado "cubicleFlip" em (10,4) — as duas na fileira do corredor.
    expect(map.seats.some((s) => s.id === "ws-9-4")).toBe(true)
    expect(map.seats.some((s) => s.id === "ws-10-4")).toBe(true)
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
