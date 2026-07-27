import { describe, expect, it } from "vitest"

import { canGoTo, floorButtons, isUnlocked } from "./elevator"
import type { FloorDef } from "./floors"

const FAKE: FloorDef[] = [
  { n: 1, label: "Bullpen", build: () => ({}) as never },
  { n: 2, label: "Reunião" },
  { n: 3, label: "Copa", build: () => ({}) as never },
]

describe("isUnlocked", () => {
  it("libera andar com planta e trava andar sem planta", () => {
    expect(isUnlocked(FAKE[0])).toBe(true)
    expect(isUnlocked(FAKE[1])).toBe(false)
  })
})

describe("canGoTo", () => {
  it("aceita andar liberado diferente do atual", () => {
    expect(canGoTo(FAKE, 1, 3)).toBe(true)
  })

  it("recusa o andar em que já se está", () => {
    expect(canGoTo(FAKE, 1, 1)).toBe(false)
  })

  it("recusa andar em obras", () => {
    expect(canGoTo(FAKE, 1, 2)).toBe(false)
  })

  it("recusa andar que não existe", () => {
    expect(canGoTo(FAKE, 1, 9)).toBe(false)
  })
})

describe("floorButtons", () => {
  it("lista todos os andares do maior para o menor", () => {
    expect(floorButtons(FAKE, 1).map((b) => b.n)).toEqual([3, 2, 1])
  })

  it("marca o andar atual e os travados", () => {
    const buttons = floorButtons(FAKE, 1)
    expect(buttons.find((b) => b.n === 1)).toMatchObject({ current: true, locked: false })
    expect(buttons.find((b) => b.n === 2)).toMatchObject({ current: false, locked: true })
  })

  it("não perde nem duplica andar", () => {
    expect(floorButtons(FAKE, 1)).toHaveLength(FAKE.length)
  })
})
