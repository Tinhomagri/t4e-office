import { describe, expect, it } from "vitest"

import { nearestSeatedUser } from "./hover"

const SEATS = [
  { x: 100, y: 100, kind: "pc" },
  { x: 300, y: 300, kind: "pc" },
  { x: 200, y: 200, kind: "poker" },
]

describe("nearestSeatedUser", () => {
  it("acha o usuário sentado numa baia (kind pc) perto do ponto", () => {
    const actors = [{ id: "u1", x: 100, y: 100 }]
    expect(nearestSeatedUser(actors, SEATS, 105, 102)).toBe("u1")
  })

  it("ignora atores de pé (não perto de nenhum assento)", () => {
    const actors = [{ id: "u1", x: 500, y: 500 }]
    expect(nearestSeatedUser(actors, SEATS, 500, 500)).toBeNull()
  })

  it("ignora assento de poker (kind !== pc)", () => {
    const actors = [{ id: "u1", x: 200, y: 200 }]
    expect(nearestSeatedUser(actors, SEATS, 200, 200)).toBeNull()
  })

  it("fora do raio não acha ninguém", () => {
    const actors = [{ id: "u1", x: 100, y: 100 }]
    expect(nearestSeatedUser(actors, SEATS, 500, 500)).toBeNull()
  })

  it("ignora ator de pé PERTO do ponto do mouse (colega passando pela mesa)", () => {
    // Ator dentro do hoverRadius (20) do ponto consultado, mas a 30px do
    // assento "pc" mais próximo — bem além do seatSnapRadius (4). É o caso
    // que a checagem de encaixe no assento existe pra rejeitar.
    const actors = [{ id: "u1", x: 130, y: 100 }]
    expect(nearestSeatedUser(actors, SEATS, 128, 100)).toBeNull()
  })

  it("com dois candidatos sentados, escolhe o mais perto", () => {
    const actors = [
      { id: "longe", x: 300, y: 300 },
      { id: "perto", x: 100, y: 100 },
    ]
    expect(nearestSeatedUser(actors, SEATS, 102, 100)).toBe("perto")
  })
})
