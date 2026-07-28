import { describe, expect, it } from "vitest"

import { PROPS, type PropKind } from "./props"
import { TILE } from "./tiles"
import { makeCanvas } from "./pixels"

const NOVOS: PropKind[] = [
  "cubicle", "cubicleFlip", "copier", "filingCabinet",
  "coatRack", "noticeBoard", "receptionDesk", "elevatorDoors",
]

describe("props novos do bullpen", () => {
  it("todos existem", () => {
    for (const k of NOVOS) expect(PROPS[k]).toBeDefined()
  })

  it("todo prop tem tamanho positivo e baseline dentro da altura", () => {
    for (const k of NOVOS) {
      const p = PROPS[k]
      expect(p.w).toBeGreaterThan(0)
      expect(p.h).toBeGreaterThan(0)
      expect(p.baseline ?? p.h).toBeLessThanOrEqual(p.h)
    }
  })

  it("colisão declarada cabe dentro do sprite", () => {
    for (const k of NOVOS) {
      const p = PROPS[k]
      if (!p.solid) continue
      expect(p.solid.x + p.solid.w).toBeLessThanOrEqual(p.w)
      expect(p.solid.y + p.solid.h).toBeLessThanOrEqual(p.h)
    }
  })
})

describe("baia", () => {
  it("ocupa 4×3 tiles", () => {
    expect(PROPS.cubicle.w).toBe(4 * TILE)
    expect(PROPS.cubicle.h).toBe(3 * TILE)
  })

  it("deixa a faixa de baixo livre — é por onde se entra na baia", () => {
    const solid = PROPS.cubicle.solid!
    const livre = PROPS.cubicle.h - (solid.y + solid.h)
    expect(livre).toBeGreaterThanOrEqual(TILE - 2)
  })

  it("a versão espelhada deixa a faixa de CIMA livre", () => {
    const solid = PROPS.cubicleFlip.solid!
    expect(solid.y).toBeGreaterThanOrEqual(TILE - 2)
  })

  it("as duas versões têm o mesmo tamanho, para encostarem de costas", () => {
    expect(PROPS.cubicleFlip.w).toBe(PROPS.cubicle.w)
    expect(PROPS.cubicleFlip.h).toBe(PROPS.cubicle.h)
  })
})

describe("portas do elevador", () => {
  it("ocupam a largura da cabine (4 tiles) e bloqueiam", () => {
    expect(PROPS.elevatorDoors.w).toBe(4 * TILE)
    expect(PROPS.elevatorDoors.solid).toBeTruthy()
  })
})

describe("props de Planning Poker", () => {
  it("pokerTable é sólida e maior que uma mesa comum", () => {
    expect(PROPS.pokerTable.solid).toBeTruthy()
    expect(PROPS.pokerTable.w).toBeGreaterThan(PROPS.meetingTable.w)
  })

  it("pokerScreen é sólido só numa faixa fina (montado na parede)", () => {
    expect(PROPS.pokerScreen.solid!.h).toBeLessThan(PROPS.pokerScreen.h)
  })

  it("pokerConsole é sólido", () => {
    expect(PROPS.pokerConsole.solid).toBeTruthy()
  })

  it("os três desenham sem lançar exceção", () => {
    for (const kind of ["pokerTable", "pokerScreen", "pokerConsole"] as const) {
      const { canvas, ctx } = makeCanvas(PROPS[kind].w, PROPS[kind].h)
      expect(() => PROPS[kind].draw(ctx)).not.toThrow()
      expect(canvas.width).toBe(PROPS[kind].w)
    }
  })
})
