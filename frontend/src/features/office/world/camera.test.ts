import { describe, expect, it } from "vitest"

import {
  cameraTarget,
  FOCUS_MAX,
  focusScale,
  integerScale,
  offsetCamera,
  screenToWorld,
  VIEW_OFFSET_PX,
  viewOffsetFor,
  viewportFor,
  worldToScreen,
} from "./camera"

describe("integerScale", () => {
  it("usa 4× quando a tela é larga o suficiente", () => {
    expect(integerScale(1600, 1000)).toBe(4)
  })

  it("nunca passa de 4× por padrão", () => {
    expect(integerScale(4000, 3000)).toBe(4)
  })

  it("nunca desce abaixo de 2× em tela apertada", () => {
    expect(integerScale(320, 200)).toBe(2)
    expect(integerScale(100, 80)).toBe(2)
  })

  it("é sempre inteira — é isso que impede o pixel-art de tremer", () => {
    for (const w of [700, 900, 1130, 1441]) {
      expect(Number.isInteger(integerScale(w, w * 0.625))).toBe(true)
    }
  })

  it("aceita teto maior quando a câmera está com foco", () => {
    expect(integerScale(1600, 1000, 8)).toBe(5)
    expect(integerScale(4000, 3000, 8)).toBe(8)
  })
})

describe("viewportFor", () => {
  it("deriva a viewport em pixels de mundo, arredondando para cima", () => {
    expect(viewportFor(1600, 1000, 4)).toEqual({ viewW: 400, viewH: 250 })
    expect(viewportFor(1601, 1000, 4)).toEqual({ viewW: 401, viewH: 250 })
  })
})

describe("worldToScreen / screenToWorld", () => {
  it("converte mundo para tela descontando a câmera e aplicando a escala", () => {
    expect(worldToScreen(100, 50, 3, 130, 70)).toEqual({ x: 90, y: 60 })
  })

  it("screenToWorld é o inverso exato de worldToScreen", () => {
    const cam = { x: 128, y: 96 }
    const scale = 4
    const world = { x: 424, y: 158 }
    const screen = worldToScreen(cam.x, cam.y, scale, world.x, world.y)
    expect(screenToWorld(cam.x, cam.y, scale, screen.x, screen.y)).toEqual(world)
  })
})

describe("cameraTarget", () => {
  it("centraliza o ponto na viewport", () => {
    expect(cameraTarget(500, 400, 400, 250, 960, 608)).toEqual({ x: 300, y: 275 })
  })

  it("trava na borda esquerda/superior em vez de mostrar vazio", () => {
    expect(cameraTarget(50, 20, 400, 250, 960, 608)).toEqual({ x: 0, y: 0 })
  })

  it("trava na borda direita/inferior", () => {
    expect(cameraTarget(950, 600, 400, 250, 960, 608)).toEqual({ x: 560, y: 358 })
  })

  it("quando o mapa é menor que a viewport, fixa em zero", () => {
    expect(cameraTarget(100, 100, 2000, 2000, 960, 608)).toEqual({ x: 0, y: 0 })
  })
})

describe("escala sob foco", () => {
  it("com teto 8, uma tela média chega a mais zoom do que o normal", () => {
    const cssW = 1400
    const cssH = 900
    expect(integerScale(cssW, cssH)).toBe(4)
    expect(integerScale(cssW, cssH, 8)).toBe(4)
    expect(integerScale(2600, 1700, 8)).toBe(8)
  })

  it("o teto não reduz a escala abaixo do normal", () => {
    for (const [w, h] of [[600, 400], [1000, 700], [1920, 1080]] as const) {
      expect(integerScale(w, h, 8)).toBeGreaterThanOrEqual(integerScale(w, h))
    }
  })
})

describe("focusScale", () => {
  it("respeita o zoom pedido quando ele é maior que a escala normal", () => {
    expect(focusScale(1400, 900, 6)).toBe(6)
  })

  it("nunca fica abaixo da escala normal daquela tela", () => {
    expect(focusScale(2600, 1700, 3)).toBe(integerScale(2600, 1700, FOCUS_MAX))
  })

  it("clampa no teto — zoom absurdo não colapsa a viewport", () => {
    expect(focusScale(1400, 900, 40)).toBe(FOCUS_MAX)
    expect(focusScale(1400, 900, 999)).toBe(FOCUS_MAX)
  })

  it("arredonda zoom fracionário para inteiro", () => {
    expect(focusScale(1400, 900, 5.6)).toBe(6)
    expect(Number.isInteger(focusScale(1400, 900, 6.4))).toBe(true)
  })
})

describe("viewOffsetFor", () => {
  it("empurra a câmera no sentido em que o avatar olha", () => {
    expect(viewOffsetFor("down")).toEqual({ dx: 0, dy: VIEW_OFFSET_PX })
    expect(viewOffsetFor("up")).toEqual({ dx: 0, dy: -VIEW_OFFSET_PX })
    expect(viewOffsetFor("right")).toEqual({ dx: VIEW_OFFSET_PX, dy: 0 })
    expect(viewOffsetFor("left")).toEqual({ dx: -VIEW_OFFSET_PX, dy: 0 })
  })
})

describe("offsetCamera", () => {
  const view = { w: 320, h: 200 }
  const world = { w: 1152, h: 736 }

  it("desloca quando há folga", () => {
    const base = { x: 400, y: 300 }
    const out = offsetCamera(base, 0, 40, view.w, view.h, world.w, world.h)
    expect(out.y).toBe(340)
    expect(out.x).toBe(400)
  })

  it("não passa da borda inferior do mapa", () => {
    const base = { x: 0, y: world.h - view.h }
    const out = offsetCamera(base, 0, 400, view.w, view.h, world.w, world.h)
    expect(out.y).toBe(world.h - view.h)
  })

  it("não passa da borda superior", () => {
    const out = offsetCamera({ x: 0, y: 0 }, 0, -400, view.w, view.h, world.w, world.h)
    expect(out.y).toBe(0)
  })

  it("não passa das bordas laterais em nenhuma quina", () => {
    for (const base of [
      { x: 0, y: 0 },
      { x: world.w - view.w, y: 0 },
      { x: 0, y: world.h - view.h },
      { x: world.w - view.w, y: world.h - view.h },
    ]) {
      for (const [dx, dy] of [[400, 0], [-400, 0], [0, 400], [0, -400]]) {
        const out = offsetCamera(base, dx, dy, view.w, view.h, world.w, world.h)
        expect(out.x).toBeGreaterThanOrEqual(0)
        expect(out.y).toBeGreaterThanOrEqual(0)
        expect(out.x).toBeLessThanOrEqual(world.w - view.w)
        expect(out.y).toBeLessThanOrEqual(world.h - view.h)
      }
    }
  })

  it("mapa menor que a viewport não gera coordenada negativa", () => {
    const out = offsetCamera({ x: 0, y: 0 }, 0, 40, 800, 600, 400, 300)
    expect(out).toEqual({ x: 0, y: 0 })
  })
})
