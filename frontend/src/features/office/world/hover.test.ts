import { describe, expect, it } from "vitest"

import { nearestSeatedUser } from "./hover"

const SEATS = [
  { kind: "pc" },
  { kind: "poker" },
]

describe("nearestSeatedUser", () => {
  it("acha o usuário sentado numa baia (kind pc) perto do ponto", () => {
    const actors = [{ id: "u1", x: 100, y: 100, seatIndex: 0 }]
    expect(nearestSeatedUser(actors, SEATS, 105, 102)).toBe("u1")
  })

  it("ignora atores de pé (seatIndex -1)", () => {
    const actors = [{ id: "u1", x: 100, y: 100, seatIndex: -1 }]
    expect(nearestSeatedUser(actors, SEATS, 100, 100)).toBeNull()
  })

  it("ignora assento de poker (kind !== pc)", () => {
    const actors = [{ id: "u1", x: 100, y: 100, seatIndex: 1 }]
    expect(nearestSeatedUser(actors, SEATS, 100, 100)).toBeNull()
  })

  it("fora do raio não acha ninguém", () => {
    const actors = [{ id: "u1", x: 100, y: 100, seatIndex: 0 }]
    expect(nearestSeatedUser(actors, SEATS, 500, 500)).toBeNull()
  })

  it("com dois candidatos, escolhe o mais perto", () => {
    const actors = [
      { id: "longe", x: 0, y: 0, seatIndex: 0 },
      { id: "perto", x: 100, y: 100, seatIndex: 0 },
    ]
    expect(nearestSeatedUser(actors, SEATS, 102, 100)).toBe("perto")
  })
})
