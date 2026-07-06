import { describe, expect, it } from "vitest"
import { poseFor } from "./chibi"

describe("poseFor", () => {
  it("idle segue o ciclo de body 0,0,1,1", () => {
    expect(poseFor("idle", 0).body).toBe(0)
    expect(poseFor("idle", 2).body).toBe(1)
    expect(poseFor("idle", 3).body).toBe(1)
    expect(poseFor("idle", 4).body).toBe(0) // ciclo reinicia
  })

  it("é determinística para o mesmo (anim, frame)", () => {
    expect(poseFor("walk", 5)).toEqual(poseFor("walk", 5))
  })

  it("wave mantém rosto feliz em todos os frames", () => {
    for (let f = 0; f < 5; f++) {
      expect(poseFor("wave", f).face).toBe("happy")
    }
  })

  it("anim desconhecida cai no fallback body 0", () => {
    expect(poseFor("inexistente", 0)).toEqual({ body: 0 })
  })
})
