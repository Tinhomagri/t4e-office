import { describe, expect, it } from "vitest"

import { ALPHA_TILES, SOLID_TILES, T } from "./tiles"

describe("ids de tile", () => {
  it("não tem id duplicado", () => {
    const ids = Object.values(T)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("não existe mais tile de janela", () => {
    expect("WINDOW" in T).toBe(false)
  })
})

describe("colisão por tile", () => {
  it("vidro e guarda-corpo bloqueiam; porta de vidro e deck não", () => {
    expect(SOLID_TILES.has(T.GLASS)).toBe(true)
    expect(SOLID_TILES.has(T.RAILING)).toBe(true)
    expect(SOLID_TILES.has(T.GLASS_DOOR)).toBe(false)
    expect(SOLID_TILES.has(T.DECK)).toBe(false)
  })

  it("o vazio segue bloqueado — ninguém cai do prédio", () => {
    expect(SOLID_TILES.has(T.VOID)).toBe(true)
  })

  it("piso interno continua livre", () => {
    for (const id of [T.WOOD, T.CARPET, T.TILEFLOOR, T.DOORWAY]) {
      expect(SOLID_TILES.has(id)).toBe(false)
    }
  })
})

describe("tiles com alfa", () => {
  it("vidro, porta de vidro e guarda-corpo deixam o céu passar", () => {
    expect([...ALPHA_TILES].sort()).toEqual([T.GLASS, T.GLASS_DOOR, T.RAILING].sort())
  })

  it("piso e parede opacos não estão na lista", () => {
    for (const id of [T.WOOD, T.WALL, T.WALL_TOP, T.DECK]) {
      expect(ALPHA_TILES.has(id)).toBe(false)
    }
  })
})
