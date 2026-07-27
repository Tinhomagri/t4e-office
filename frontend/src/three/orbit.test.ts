import { describe, expect, it } from "vitest"

import { damp, ORBIT, orbitBank, orbitHeading, orbitPosition } from "./orbit"

describe("orbitPosition", () => {
  it("fecha a volta no fim do período", () => {
    const a = orbitPosition(0)
    const b = orbitPosition(ORBIT.period)
    expect(b.x).toBeCloseTo(a.x, 5)
    expect(b.y).toBeCloseTo(a.y, 5)
    expect(b.z).toBeCloseTo(a.z, 5)
  })

  it("passa pela frente e por trás do centro", () => {
    let minZ = Infinity
    let maxZ = -Infinity
    for (let t = 0; t < ORBIT.period; t += 0.1) {
      const p = orbitPosition(t)
      minZ = Math.min(minZ, p.z)
      maxZ = Math.max(maxZ, p.z)
    }
    expect(minZ).toBeLessThan(-1)
    expect(maxZ).toBeGreaterThan(1)
  })

  it("mantém a nave dentro de um envelope previsível", () => {
    for (let t = 0; t < ORBIT.period; t += 0.05) {
      const p = orbitPosition(t)
      expect(Math.abs(p.x)).toBeLessThanOrEqual(ORBIT.radiusX + 0.001)
      expect(Math.abs(p.y)).toBeLessThan(ORBIT.bobY + ORBIT.radiusZ)
    }
  })

  it("escreve no objeto de saída em vez de alocar", () => {
    const out = { x: 0, y: 0, z: 0 }
    const r = orbitPosition(1, ORBIT, out)
    expect(r).toBe(out)
  })

  it("respeita parâmetros customizados", () => {
    const flat = orbitPosition(0, { ...ORBIT, tilt: 0, bobY: 0 })
    expect(flat.y).toBeCloseTo(0, 6)
    expect(flat.x).toBeCloseTo(ORBIT.radiusX, 6)
  })
})

describe("orbitHeading", () => {
  it("aponta na direção do movimento", () => {
    const t = 2
    const h = orbitHeading(t)
    const a = orbitPosition(t)
    const b = orbitPosition(t + 0.1)
    const real = Math.atan2(b.x - a.x, b.z - a.z)
    // Diferença angular normalizada.
    let d = h - real
    while (d > Math.PI) d -= Math.PI * 2
    while (d < -Math.PI) d += Math.PI * 2
    expect(Math.abs(d)).toBeLessThan(0.15)
  })
})

describe("orbitBank", () => {
  it("nunca passa do limite", () => {
    for (let t = 0; t < ORBIT.period; t += 0.02) {
      expect(Math.abs(orbitBank(t))).toBeLessThanOrEqual(0.5 + 1e-9)
    }
  })

  it("não dá espasmo na virada de -π para π", () => {
    let prev = orbitBank(0)
    let maxJump = 0
    for (let t = 0.02; t < ORBIT.period; t += 0.02) {
      const b = orbitBank(t)
      maxJump = Math.max(maxJump, Math.abs(b - prev))
      prev = b
    }
    // Sem a normalização do ângulo isto estouraria (salto ~1 rad num frame).
    expect(maxJump).toBeLessThan(0.1)
  })
})

describe("damp", () => {
  it("converge para o alvo", () => {
    let v = 0
    for (let i = 0; i < 120; i++) v = damp(v, 10, 6, 1 / 60)
    expect(v).toBeCloseTo(10, 1)
  })

  it("é estável com dt grande", () => {
    const v = damp(0, 10, 6, 5)
    expect(v).toBeLessThanOrEqual(10)
    expect(v).toBeGreaterThan(9)
  })

  it("não se move quando já está no alvo", () => {
    expect(damp(3, 3, 8, 0.016)).toBe(3)
  })
})
