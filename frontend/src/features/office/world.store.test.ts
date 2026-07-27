import { beforeEach, describe, expect, it } from "vitest"

import { useWorldStore } from "./world.store"

const reset = () => useWorldStore.setState({ floor: 1, panelOpen: false })

describe("world.store", () => {
  beforeEach(reset)

  it("começa no andar 1 com o painel fechado", () => {
    expect(useWorldStore.getState().floor).toBe(1)
    expect(useWorldStore.getState().panelOpen).toBe(false)
  })

  it("abre e fecha o painel", () => {
    useWorldStore.getState().openPanel()
    expect(useWorldStore.getState().panelOpen).toBe(true)
    useWorldStore.getState().closePanel()
    expect(useWorldStore.getState().panelOpen).toBe(false)
  })

  it("recusa ir para andar em obras e mantém o andar atual", () => {
    useWorldStore.getState().openPanel()
    expect(useWorldStore.getState().goToFloor(2)).toBe(false)
    expect(useWorldStore.getState().floor).toBe(1)
    expect(useWorldStore.getState().panelOpen).toBe(true)
  })

  it("recusa ir para o andar em que já está", () => {
    expect(useWorldStore.getState().goToFloor(1)).toBe(false)
  })

  it("aceitar a troca fecha o painel", () => {
    // Simula um segundo andar liberado sem depender do registry real.
    useWorldStore.setState({ floor: 2, panelOpen: true })
    expect(useWorldStore.getState().goToFloor(1)).toBe(true)
    expect(useWorldStore.getState().floor).toBe(1)
    expect(useWorldStore.getState().panelOpen).toBe(false)
  })
})
