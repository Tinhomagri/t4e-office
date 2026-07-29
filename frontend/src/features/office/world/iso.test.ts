import { describe, expect, it } from "vitest"

import { TILE } from "./tiles"
import { isoMapSize, isoOrigin, isoToWorld, worldToIso } from "./iso"

describe("worldToIso / isoToWorld", () => {
  it("é a inversa exata uma da outra", () => {
    const cases: [number, number][] = [
      [0, 0], [100, 0], [0, 100], [37, 91], [-40, 200], [123.5, 44.25],
    ]
    for (const [x, y] of cases) {
      const iso = worldToIso(x, y)
      const back = isoToWorld(iso.x, iso.y)
      expect(back.x).toBeCloseTo(x, 6)
      expect(back.y).toBeCloseTo(y, 6)
    }
  })

  it("anda só em X de mundo desloca a tela em diagonal (x e y de tela mudam)", () => {
    const a = worldToIso(0, 0)
    const b = worldToIso(TILE, 0)
    expect(b.x).toBeGreaterThan(a.x)
    expect(b.y).toBeGreaterThan(a.y)
  })

  it("anda só em Y de mundo espelha em X de tela", () => {
    const a = worldToIso(0, 0)
    const b = worldToIso(0, TILE)
    expect(b.x).toBeLessThan(a.x)
    expect(b.y).toBeGreaterThan(a.y)
  })
})

describe("isoMapSize / isoOrigin", () => {
  it("cobre o mapa inteiro dentro do retângulo, com a origem aplicada", () => {
    const cols = 40
    const rows = 20
    const { w, h } = isoMapSize(cols, rows)
    const origin = isoOrigin(cols, rows)

    const corners: [number, number][] = [
      [0, 0], [cols * TILE, 0], [0, rows * TILE], [cols * TILE, rows * TILE],
    ]
    for (const [x, y] of corners) {
      const p = worldToIso(x, y)
      const sx = p.x + origin.x
      const sy = p.y + origin.y
      expect(sx).toBeGreaterThanOrEqual(-0.001)
      expect(sx).toBeLessThanOrEqual(w + 0.001)
      expect(sy).toBeGreaterThanOrEqual(-0.001)
      expect(sy).toBeLessThanOrEqual(h + 0.001)
    }
  })
})
