import { describe, expect, it } from "vitest"

import { buildOfficeMap } from "./map"

const map = buildOfficeMap()

describe("assentos", () => {
  it("todo assento tem id único", () => {
    const ids = map.seats.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("id deriva do tile do assento, não do índice do array", () => {
    // Ilha em (26,6): o assento da esquerda cai no tile (26,9).
    expect(map.seats.some((s) => s.id === "ws-26-9")).toBe(true)
    // Cabine de foco mais alta: assento no tile (5,29).
    expect(map.seats.some((s) => s.id === "ws-5-29")).toBe(true)
  })

  it("estações, mesas individuais e cabines são kind 'pc' — 14 no total", () => {
    const pc = map.seats.filter((s) => s.kind === "pc")
    expect(pc).toHaveLength(14)
    for (const s of pc) expect(s.id.startsWith("ws-")).toBe(true)
  })

  it("sala de reunião é kind 'meeting'", () => {
    const meeting = map.seats.filter((s) => s.kind === "meeting")
    expect(meeting).toHaveLength(6)
    for (const s of meeting) expect(s.label).toBe("Sala de reunião")
  })

  it("sofá e copa são kind 'lounge' — não abrem PC", () => {
    const lounge = map.seats.filter((s) => s.kind === "lounge")
    expect(lounge).toHaveLength(4)
    for (const s of lounge) expect(s.kind).not.toBe("pc")
  })

  it("nenhum assento cai em tile bloqueado", () => {
    for (const seat of map.seats) {
      const tx = Math.floor(seat.x / 16)
      const ty = Math.floor(seat.y / 16)
      expect(map.collision[ty * map.cols + tx]).toBe(0)
    }
  })
})
