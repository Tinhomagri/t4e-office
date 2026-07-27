import { describe, expect, it } from "vitest"

import { ANIMS, ANIM_FPS, ANIM_LABELS } from "./avatar.types"

describe("clipe lean", () => {
  it("está registrado com frames, rótulo e fps", () => {
    expect(ANIMS.lean).toBeGreaterThan(0)
    expect(ANIM_LABELS.lean).toBe("Apoiado")
    expect(ANIM_FPS.lean).toBeGreaterThan(0)
  })

  it("é lento — apoiar no guarda-corpo não é agitado", () => {
    expect(ANIM_FPS.lean).toBeLessThanOrEqual(4)
  })

  it("todo clipe com fps declarado existe em ANIMS", () => {
    for (const name of Object.keys(ANIM_FPS)) expect(ANIMS[name]).toBeGreaterThan(0)
  })
})
