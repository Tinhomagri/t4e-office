import { describe, expect, it } from "vitest"

import { clamp01, facingFromDelta } from "./office.util"

describe("facingFromDelta", () => {
  it("prioriza o eixo horizontal quando |dx| >= |dy|", () => {
    expect(facingFromDelta(1, 0)).toBe("right")
    expect(facingFromDelta(-1, 0)).toBe("left")
    expect(facingFromDelta(0.6, 0.5)).toBe("right")
  })

  it("usa o eixo vertical quando |dy| > |dx|", () => {
    expect(facingFromDelta(0, 1)).toBe("down")
    expect(facingFromDelta(0, -1)).toBe("up")
    expect(facingFromDelta(0.2, -0.9)).toBe("up")
  })

  it("retorna 'down' quando não há deslocamento", () => {
    expect(facingFromDelta(0, 0)).toBe("down")
  })
})

describe("clamp01", () => {
  it("limita ao intervalo [0, 1]", () => {
    expect(clamp01(-3)).toBe(0)
    expect(clamp01(5)).toBe(1)
    expect(clamp01(0.42)).toBe(0.42)
  })
})
