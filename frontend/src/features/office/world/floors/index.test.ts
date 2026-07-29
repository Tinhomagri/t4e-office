import { describe, expect, it } from "vitest"

import { FLOORS, buildFloor, floorDef } from "./index"

describe("registry de andares", () => {
  it("lista quatro andares, numerados de 1 a 4 sem buraco", () => {
    expect(FLOORS.map((f) => f.n)).toEqual([1, 2, 3, 4])
  })

  it("andares 1 e 2 têm planta; 3 e 4 estão em obras", () => {
    expect(typeof floorDef(1)?.build).toBe("function")
    expect(typeof floorDef(2)?.build).toBe("function")
    for (const n of [3, 4]) expect(floorDef(n)?.build).toBeUndefined()
  })

  it("todo andar tem rótulo não vazio", () => {
    for (const f of FLOORS) expect(f.label.length).toBeGreaterThan(0)
  })

  it("buildFloor devolve o mapa do andar 1", () => {
    const map = buildFloor(1)
    expect(map.cols).toBeGreaterThan(0)
    expect(map.seats.length).toBeGreaterThan(0)
  })

  it("buildFloor recusa andar em obras e andar inexistente", () => {
    expect(() => buildFloor(3)).toThrow(/em obras/i)
    expect(() => buildFloor(99)).toThrow(/inexistente/i)
  })

  it("buildFloor devolve o mapa do andar 2 (poker)", () => {
    const map = buildFloor(2)
    expect(map.seats.filter((s) => s.kind === "poker")).toHaveLength(16)
  })

  it("buildFloor recusa andar em obras", () => {
    expect(() => buildFloor(3)).toThrow(/em obras/i)
  })
})
