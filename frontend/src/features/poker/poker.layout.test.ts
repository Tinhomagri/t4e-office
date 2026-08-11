import { describe, expect, it } from "vitest"

import {
  SEATS_MAX,
  SEAT_BOX_H,
  SEAT_COL_W,
  TILE_H,
  TILE_W,
  seatLayout,
  tableSize,
  wrapperMargins,
} from "./poker.layout"

interface Box {
  l: number
  r: number
  t: number
  b: number
}

const overlap = (a: Box, b: Box): number => {
  const x = Math.min(a.r, b.r) - Math.max(a.l, b.l)
  const y = Math.min(a.b, b.b) - Math.max(a.t, b.t)
  return x > 0 && y > 0 ? Math.min(x, y) : 0
}

function boxes(count: number, videoActive: boolean) {
  const { width, height } = tableSize(count)
  const margin = wrapperMargins(videoActive)
  return seatLayout(count, width, height, videoActive).map((s) => ({
    seat: {
      l: s.x - SEAT_COL_W / 2,
      r: s.x + SEAT_COL_W / 2,
      t: s.y - SEAT_BOX_H / 2,
      b: s.y + SEAT_BOX_H / 2,
    },
    tile: {
      l: s.videoX - TILE_W / 2,
      r: s.videoX + TILE_W / 2,
      t: s.videoY - TILE_H / 2,
      b: s.videoY + TILE_H / 2,
    },
    wrapper: {
      w: width + margin.x * 2,
      h: height + margin.y * 2,
      table: { l: margin.x, r: margin.x + width, t: margin.y, b: margin.y + height },
    },
  }))
}

const sizes = Array.from({ length: SEATS_MAX }, (_, i) => i + 1)

describe("seatLayout com câmera ligada", () => {
  // Foi exatamente isto que quebrou na primeira versão: o cartão de vídeo,
  // ancorado sempre "acima" do assento, caía em cima da carta do vizinho.
  it.each(sizes)("não deixa o cartão de vídeo cobrir assento nenhum (%i na mesa)", (n) => {
    const b = boxes(n, true)
    for (let i = 0; i < n; i++) {
      // Inclui o próprio assento (i === j): pular esse par foi o que deixou o
      // cartão passar por cima da carta e do nome do próprio dono.
      for (let j = 0; j < n; j++) {
        expect(overlap(b[i].tile, b[j].seat)).toBe(0)
      }
    }
  })

  it.each(sizes)("não deixa dois cartões de vídeo se sobreporem (%i na mesa)", (n) => {
    const b = boxes(n, true)
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        expect(overlap(b[i].tile, b[j].tile)).toBe(0)
      }
    }
  })

  it.each(sizes)("mantém o cartão fora do tampo, onde fica a carta da rodada (%i)", (n) => {
    const b = boxes(n, true)
    // Retângulo inscrito na elipse do tampo — aproximação conservadora.
    for (const { tile, wrapper } of b) {
      const t = wrapper.table
      const cx = (t.l + t.r) / 2
      const cy = (t.t + t.b) / 2
      const inner = {
        l: cx - ((t.r - t.l) / 2) * 0.92,
        r: cx + ((t.r - t.l) / 2) * 0.92,
        t: cy - ((t.b - t.t) / 2) * 0.92,
        b: cy + ((t.b - t.t) / 2) * 0.92,
      }
      expect(overlap(tile, inner)).toBe(0)
    }
  })

  it.each(sizes)("cabe dentro do wrapper, sem vazar para o header (%i)", (n) => {
    for (const { tile, wrapper } of boxes(n, true)) {
      expect(tile.l).toBeGreaterThanOrEqual(0)
      expect(tile.t).toBeGreaterThanOrEqual(0)
      expect(tile.r).toBeLessThanOrEqual(wrapper.w)
      expect(tile.b).toBeLessThanOrEqual(wrapper.h)
    }
  })
})

describe("coordenadas relativas ao centro", () => {
  // A tela posiciona por ox/oy. Se eles saíssem do eixo de x/y, a prova de
  // não-sobreposição acima valeria para um layout que não é o renderizado.
  it.each(sizes)("ox/oy apontam para o mesmo ponto que x/y (%i na mesa)", (n) => {
    for (const videoActive of [false, true]) {
      const { width, height } = tableSize(n)
      const margin = wrapperMargins(videoActive)
      const centerX = margin.x + width / 2
      const centerY = margin.y + height / 2
      for (const s of seatLayout(n, width, height, videoActive)) {
        expect(centerX + s.ox).toBeCloseTo(s.x, 6)
        expect(centerY + s.oy).toBeCloseTo(s.y, 6)
        expect(centerX + s.videoOx).toBeCloseTo(s.videoX, 6)
        expect(centerY + s.videoOy).toBeCloseTo(s.videoY, 6)
      }
    }
  })
})

describe("seatLayout sem câmera", () => {
  it.each(sizes)("mantém os assentos dentro do wrapper (%i na mesa)", (n) => {
    for (const { seat, wrapper } of boxes(n, false)) {
      expect(seat.l).toBeGreaterThanOrEqual(0)
      expect(seat.t).toBeGreaterThanOrEqual(0)
      expect(seat.r).toBeLessThanOrEqual(wrapper.w)
      expect(seat.b).toBeLessThanOrEqual(wrapper.h)
    }
  })

  it("espalha os assentos por arco, não por ângulo", () => {
    // Numa elipse achatada, passo angular constante amontoa gente nas
    // laterais — com 10 na mesa a razão abaixo cai para ~0,59. Por arco ela
    // sobe para ~0,89; não chega a 1 porque o que se mede aqui é a corda entre
    // vizinhos, e corda encurta onde a curva fecha.
    const { width, height } = tableSize(10)
    const slots = seatLayout(10, width, height, false)
    const gaps = slots.map((s, i) => {
      const next = slots[(i + 1) % slots.length]
      return Math.hypot(next.x - s.x, next.y - s.y)
    })
    expect(Math.min(...gaps) / Math.max(...gaps)).toBeGreaterThan(0.85)
  })
})
