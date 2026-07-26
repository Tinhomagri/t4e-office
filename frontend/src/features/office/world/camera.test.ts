import { describe, expect, it } from "vitest"

import {
  cameraTarget,
  integerScale,
  screenToWorld,
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
