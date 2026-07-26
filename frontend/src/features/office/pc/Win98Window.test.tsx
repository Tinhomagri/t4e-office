import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it } from "vitest"

import { usePcStore } from "./pc.store"
import { Win98Window } from "./Win98Window"

// jsdom não implementa PointerEvent (só Event/MouseEvent); sem isso os
// fireEvent.pointer* dos testes de arrastar/redimensionar chegam com
// clientX/clientY undefined. Polyfill mínimo, só para este arquivo de teste.
if (typeof window.PointerEvent === "undefined") {
  class PointerEventPolyfill extends MouseEvent {
    pointerId?: number
    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params)
      this.pointerId = params.pointerId
    }
  }
  // @ts-expect-error polyfill mínimo, faltam campos da spec real de PointerEvent
  window.PointerEvent = PointerEventPolyfill
}

const boot = () => {
  usePcStore.getState().shutdown()
  usePcStore.getState().boot("ws-26-9")
  usePcStore.getState().ready()
  usePcStore.getState().openApp("boards", { w: 900, h: 600 })
}

const janela = () => usePcStore.getState().windows.find((w) => w.id === "boards")!

function montar() {
  return render(
    <Win98Window win={janela()} title="Boards">
      <p>conteúdo do boards</p>
    </Win98Window>,
  )
}

beforeEach(boot)

describe("<Win98Window />", () => {
  it("mostra o título e o conteúdo", () => {
    montar()
    expect(screen.getByText("Boards")).toBeInTheDocument()
    expect(screen.getByText("conteúdo do boards")).toBeInTheDocument()
  })

  it("posiciona e dimensiona por left/top/width/height — nunca por transform", () => {
    const { container } = montar()
    const root = container.firstElementChild as HTMLElement
    expect(root.style.left).toBe("40px")
    expect(root.style.top).toBe("32px")
    expect(root.style.width).toBe("900px")
    expect(root.style.height).toBe("600px")
    // Transform num ancestral viraria containing block e quebraria os modais
    // com position: fixed das páginas embutidas.
    expect(root.style.transform).toBe("")
  })

  it("botão minimizar minimiza", async () => {
    montar()
    await userEvent.click(screen.getByRole("button", { name: "Minimizar" }))
    expect(janela().minimized).toBe(true)
  })

  it("botão maximizar expande", async () => {
    montar()
    await userEvent.click(screen.getByRole("button", { name: "Maximizar" }))
    expect(usePcStore.getState().expandedId).toBe("boards")
  })

  it("botão fechar fecha", async () => {
    montar()
    await userEvent.click(screen.getByRole("button", { name: "Fechar" }))
    expect(usePcStore.getState().windows).toHaveLength(0)
  })

  it("duplo clique na titlebar alterna expandir e colapsar", async () => {
    montar()
    const titlebar = screen.getByTestId("win98-titlebar")
    await userEvent.dblClick(titlebar)
    expect(usePcStore.getState().expandedId).toBe("boards")
    await userEvent.dblClick(titlebar)
    expect(usePcStore.getState().expandedId).toBeNull()
  })

  it("arrastar a titlebar move a janela", () => {
    montar()
    const titlebar = screen.getByTestId("win98-titlebar")
    fireEvent.pointerDown(titlebar, { clientX: 100, clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(window, { clientX: 160, clientY: 130, pointerId: 1 })
    fireEvent.pointerUp(window, { pointerId: 1 })
    expect(janela()).toMatchObject({ x: 100, y: 62 })
  })

  it("arrastar a alça redimensiona", () => {
    montar()
    const handle = screen.getByTestId("win98-resize")
    fireEvent.pointerDown(handle, { clientX: 0, clientY: 0, pointerId: 2 })
    fireEvent.pointerMove(window, { clientX: 100, clientY: 50, pointerId: 2 })
    fireEvent.pointerUp(window, { pointerId: 2 })
    expect(janela()).toMatchObject({ w: 1000, h: 650 })
  })

  it("desmontar no meio do arraste não deixa listener solto", () => {
    const { unmount } = montar()
    fireEvent.pointerDown(screen.getByTestId("win98-titlebar"), {
      clientX: 100, clientY: 100, pointerId: 3,
    })
    unmount()
    const antes = janela()
    fireEvent.pointerMove(window, { clientX: 300, clientY: 300, pointerId: 3 })
    expect(janela()).toEqual(antes)
  })

  it("clicar no corpo da janela foca", async () => {
    usePcStore.getState().openApp("comercial", { w: 800, h: 500 })
    montar()
    await userEvent.click(screen.getByText("conteúdo do boards"))
    expect(usePcStore.getState().focusedId).toBe("boards")
  })

  it("a janela focada recebe a classe de titlebar ativa", () => {
    montar()
    expect(screen.getByTestId("win98-titlebar").className).toContain("win98-titlebar--active")
  })
})
