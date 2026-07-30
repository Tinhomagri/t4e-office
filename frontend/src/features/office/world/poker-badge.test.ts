import { describe, expect, it } from "vitest"

import { pokerBadgeFor } from "./poker-badge"

describe("pokerBadgeFor", () => {
  it("não mostra nada para quem não votou", () => {
    expect(pokerBadgeFor(null, false)).toBeNull()
  })

  it("mostra o verso (?) enquanto não revelado", () => {
    expect(pokerBadgeFor("8", false)).toEqual({ text: "?", revealed: false })
  })

  it("mostra o valor votado depois do reveal", () => {
    expect(pokerBadgeFor("8", true)).toEqual({ text: "8", revealed: true })
  })

  it("voto de incerteza aparece como '?' mesmo revelado", () => {
    expect(pokerBadgeFor("?", true)).toEqual({ text: "?", revealed: true })
  })
})
