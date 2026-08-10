import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { StartMenu } from "./StartMenu"
import { usePcStore } from "./pc.store"

beforeEach(() => {
  usePcStore.getState().shutdown()
  usePcStore.getState().boot("ws-26-9")
  usePcStore.getState().ready()
})

describe("<StartMenu />", () => {
  it("lista os quatro grupos", () => {
    render(<StartMenu onClose={() => {}} />)
    for (const label of ["Trabalho", "Comercial", "Marketing", "Sistema"]) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })

  it("passar o mouse no grupo revela os apps dele", async () => {
    render(<StartMenu onClose={() => {}} />)
    await userEvent.hover(screen.getByText("Comercial"))
    expect(screen.getByRole("button", { name: "Comercial" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Relatórios" })).toBeInTheDocument()
  })

  it("escolher um app habilitado abre a janela e fecha o menu", async () => {
    const onClose = vi.fn()
    render(<StartMenu onClose={onClose} />)
    await userEvent.hover(screen.getByText("Trabalho"))
    await userEvent.click(screen.getByRole("button", { name: "Boards" }))
    expect(usePcStore.getState().windows.map((w) => w.id)).toEqual(["boards"])
    expect(onClose).toHaveBeenCalled()
  })

  it("todo app do grupo está clicável — nenhum item morto no menu", async () => {
    render(<StartMenu onClose={() => {}} />)
    await userEvent.hover(screen.getByText("Sistema"))
    for (const label of ["Agenda", "Avatar", "Membros", "Mesas", "Copiloto"]) {
      expect(screen.getByRole("button", { name: label })).toBeEnabled()
    }
  })

  it("Levantar desliga o PC", async () => {
    render(<StartMenu onClose={() => {}} />)
    await userEvent.click(screen.getByRole("button", { name: "Levantar" }))
    expect(usePcStore.getState().state).toBe("off")
  })
})
