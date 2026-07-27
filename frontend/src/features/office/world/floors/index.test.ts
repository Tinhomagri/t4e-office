import { describe, expect, it } from "vitest"

import { FLOORS, buildFloor, floorDef } from "./index"

describe("registry de andares", () => {
  it("lista quatro andares, numerados de 1 a 4 sem buraco", () => {
    expect(FLOORS.map((f) => f.n)).toEqual([1, 2, 3, 4])
  })

  it("só o andar 1 tem planta; os outros estão em obras", () => {
    expect(typeof floorDef(1)?.build).toBe("function")
    for (const n of [2, 3, 4]) expect(floorDef(n)?.build).toBeUndefined()
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
    expect(() => buildFloor(2)).toThrow(/em obras/i)
    expect(() => buildFloor(99)).toThrow(/inexistente/i)
  })
})
