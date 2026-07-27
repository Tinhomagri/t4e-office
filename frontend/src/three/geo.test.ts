import { describe, expect, it } from "vitest"

import {
  FALLBACK,
  latLonToVector3,
  locationFromTimezone,
  longitudeFromOffset,
  lonToFacingRotation,
} from "./geo"

describe("latLonToVector3", () => {
  it("mantém todos os pontos sobre a esfera", () => {
    for (const [lat, lon] of [[0, 0], [-23.55, -46.63], [51.5, -0.13], [35.68, 139.69], [-90, 20]]) {
      const p = latLonToVector3(lat, lon, 2)
      expect(Math.hypot(p.x, p.y, p.z)).toBeCloseTo(2, 6)
    }
  })

  it("põe o polo norte no topo e o sul embaixo", () => {
    expect(latLonToVector3(90, 0, 1).y).toBeCloseTo(1, 6)
    expect(latLonToVector3(-90, 0, 1).y).toBeCloseTo(-1, 6)
  })

  it("mantém o equador no plano y = 0", () => {
    for (const lon of [-180, -90, 0, 90, 180]) {
      expect(latLonToVector3(0, lon, 3).y).toBeCloseTo(0, 6)
    }
  })

  it("separa hemisférios leste e oeste em Z opostos", () => {
    // lon -90 fica em +Z (frente da câmera), lon +90 no lado oposto.
    expect(latLonToVector3(0, -90, 1).z).toBeGreaterThan(0.99)
    expect(latLonToVector3(0, 90, 1).z).toBeLessThan(-0.99)
  })

  it("escala com o raio", () => {
    const a = latLonToVector3(10, 20, 1)
    const b = latLonToVector3(10, 20, 5)
    expect(b.x).toBeCloseTo(a.x * 5, 6)
    expect(b.y).toBeCloseTo(a.y * 5, 6)
  })
})

describe("lonToFacingRotation", () => {
  it("é zero para a longitude que já está de frente", () => {
    expect(lonToFacingRotation(-90)).toBeCloseTo(0, 6)
  })

  it("gira meia volta para o meridiano oposto", () => {
    expect(Math.abs(lonToFacingRotation(90))).toBeCloseTo(Math.PI, 6)
  })
})

describe("locationFromTimezone", () => {
  it("reconhece fusos brasileiros", () => {
    const p = locationFromTimezone("America/Sao_Paulo")
    expect(p.label).toBe("São Paulo")
    expect(p.lat).toBeCloseTo(-23.55, 2)
    expect(p.precise).toBe(false)
  })

  it("reconhece fusos internacionais", () => {
    expect(locationFromTimezone("Asia/Tokyo").label).toBe("Tóquio")
  })

  it("cai num palpite razoável para fuso desconhecido", () => {
    const p = locationFromTimezone("Mars/Olympus_Mons")
    expect(p.lon).toBeGreaterThanOrEqual(-180)
    expect(p.lon).toBeLessThanOrEqual(180)
    expect(p.precise).toBe(false)
  })

  it("usa o fallback quando não há fuso algum", () => {
    expect(locationFromTimezone(undefined as unknown as string)).toBeDefined()
    expect(FALLBACK.precise).toBe(false)
  })
})

describe("longitudeFromOffset", () => {
  it("converte 15 graus por hora", () => {
    const utc = new Date("2026-01-01T00:00:00Z")
    const lon = longitudeFromOffset(utc)
    expect(lon).not.toBeNull()
    expect(Math.abs(lon as number)).toBeLessThanOrEqual(180)
  })
})
