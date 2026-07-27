import { describe, expect, it } from "vitest"

import { CLOUD_DRIFT_PX_PER_S, SKY_PARALLAX, SKY_STRIP_W, cloudOffset, layerRect, skyOffset } from "./sky"

describe("SKY_PARALLAX", () => {
  it("respeita a ordem de profundidade: nuvem < longe < perto", () => {
    expect(SKY_PARALLAX.clouds).toBeLessThan(SKY_PARALLAX.far)
    expect(SKY_PARALLAX.far).toBeLessThan(SKY_PARALLAX.near)
  })

  it("nenhuma camada acompanha a câmera de um para um — senão não há profundidade", () => {
    for (const f of Object.values(SKY_PARALLAX)) {
      expect(f).toBeGreaterThan(0)
      expect(f).toBeLessThan(1)
    }
  })
})

describe("skyOffset", () => {
  it("cresce com a câmera", () => {
    expect(skyOffset(0.15, 200)).toBeGreaterThan(skyOffset(0.15, 100))
  })

  it("a camada distante desloca menos que a próxima na mesma câmera", () => {
    expect(skyOffset(SKY_PARALLAX.far, 400)).toBeLessThan(skyOffset(SKY_PARALLAX.near, 400))
  })

  it("devolve inteiro — meio pixel borra o upscale", () => {
    expect(Number.isInteger(skyOffset(0.08, 333))).toBe(true)
  })

  it("câmera na origem não desloca", () => {
    expect(skyOffset(0.15, 0)).toBe(0)
  })
})

describe("cloudOffset", () => {
  it("deriva com o tempo mesmo com câmera parada", () => {
    expect(cloudOffset(0, 10)).toBeGreaterThan(cloudOffset(0, 0))
  })

  it("usa a taxa de deriva declarada", () => {
    expect(cloudOffset(0, 10) - cloudOffset(0, 0)).toBe(10 * CLOUD_DRIFT_PX_PER_S)
  })

  it("volta ao início ao passar da largura da faixa — loop sem salto", () => {
    const oneLoop = SKY_STRIP_W / CLOUD_DRIFT_PX_PER_S
    expect(cloudOffset(0, oneLoop)).toBe(cloudOffset(0, 0))
  })

  it("nunca sai do intervalo [0, largura)", () => {
    for (const t of [0, 1, 99, 1234, 98765]) {
      const v = cloudOffset(120, t)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(SKY_STRIP_W)
    }
  })
})

describe("layerRect", () => {
  it("o recorte tem o tamanho da viewport", () => {
    const r = layerRect(SKY_PARALLAX.near, 100, 40, 320, 200)
    expect(r.sw).toBe(320)
    expect(r.sh).toBe(200)
  })

  it("o recorte nunca começa fora da faixa", () => {
    for (const cam of [0, 500, 5000, 50000]) {
      const r = layerRect(SKY_PARALLAX.near, cam, cam, 320, 200)
      expect(r.sx).toBeGreaterThanOrEqual(0)
      expect(r.sx).toBeLessThan(SKY_STRIP_W)
      expect(r.sy).toBeGreaterThanOrEqual(0)
    }
  })

  it("andar para a direita move o recorte para a direita", () => {
    const a = layerRect(SKY_PARALLAX.near, 0, 0, 320, 200)
    const b = layerRect(SKY_PARALLAX.near, 600, 0, 320, 200)
    expect(b.sx).toBeGreaterThan(a.sx)
  })
})
