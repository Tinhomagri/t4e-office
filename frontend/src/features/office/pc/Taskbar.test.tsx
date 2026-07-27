import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it } from "vitest"

import { Taskbar } from "./Taskbar"
import { usePcStore } from "./pc.store"

beforeEach(() => {
  usePcStore.getState().shutdown()
  usePcStore.getState().boot("ws-26-9")
  usePcStore.getState().ready()
})

describe("<Taskbar />", () => {
  it("mostra o botão Iniciar e o de levantar", () => {
    render(<Taskbar />)
    expect(screen.getByRole("button", { name: "Iniciar" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Levantar" })).toBeInTheDocument()
  })

  it("Iniciar abre e fecha o menu", async () => {
    render(<Taskbar />)
    await userEvent.click(screen.getByRole("button", { name: "Iniciar" }))
    expect(screen.getByTestId("start-menu")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Iniciar" }))
    expect(screen.queryByTestId("start-menu")).not.toBeInTheDocument()
  })

  it("lista uma entrada por janela aberta", () => {
    usePcStore.getState().openApp("boards", { w: 900, h: 600 })
    usePcStore.getState().openApp("comercial", { w: 900, h: 600 })
    render(<Taskbar />)
    expect(screen.getByRole("button", { name: "Boards" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Comercial" })).toBeInTheDocument()
  })

  it("clicar na entrada da janela focada minimiza", async () => {
    usePcStore.getState().openApp("boards", { w: 900, h: 600 })
    render(<Taskbar />)
    await userEvent.click(screen.getByRole("button", { name: "Boards" }))
    expect(usePcStore.getState().windows[0].minimized).toBe(true)
  })

  it("clicar na entrada de janela minimizada restaura", async () => {
    usePcStore.getState().openApp("boards", { w: 900, h: 600 })
    usePcStore.getState().minimize("boards")
    render(<Taskbar />)
    await userEvent.click(screen.getByRole("button", { name: "Boards" }))
    expect(usePcStore.getState().windows[0].minimized).toBe(false)
    expect(usePcStore.getState().focusedId).toBe("boards")
  })

  it("Levantar desliga o PC", async () => {
    usePcStore.getState().openApp("boards", { w: 900, h: 600 })
    render(<Taskbar />)
    await userEvent.click(screen.getByRole("button", { name: "Levantar" }))
    expect(usePcStore.getState().state).toBe("off")
    expect(usePcStore.getState().windows).toHaveLength(0)
  })

  it("mostra um relógio", () => {
    render(<Taskbar />)
    expect(screen.getByTestId("win98-clock").textContent).toMatch(/^\d{2}:\d{2}$/)
  })
})
