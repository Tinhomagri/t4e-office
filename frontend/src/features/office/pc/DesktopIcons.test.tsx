import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it } from "vitest"

import { DesktopIcons } from "./DesktopIcons"
import { usePcStore } from "./pc.store"

beforeEach(() => {
  usePcStore.getState().shutdown()
  usePcStore.getState().boot("ws-26-9")
  usePcStore.getState().ready()
})

describe("<DesktopIcons />", () => {
  it("mostra as quatro pastas", () => {
    render(<DesktopIcons />)
    for (const label of ["Trabalho", "Comercial", "Marketing", "Sistema"]) {
      expect(screen.getByRole("button", { name: new RegExp(label) })).toBeInTheDocument()
    }
  })

  it("duplo clique na pasta abre o conteúdo dela", async () => {
    render(<DesktopIcons />)
    await userEvent.dblClick(screen.getByRole("button", { name: /Trabalho/ }))
    expect(usePcStore.getState().openFolderId).toBe("trabalho")
    expect(screen.getByText("Boards")).toBeInTheDocument()
    expect(screen.getByText("Meu Dia")).toBeInTheDocument()
  })

  it("duplo clique num app habilitado abre a janela", async () => {
    render(<DesktopIcons />)
    await userEvent.dblClick(screen.getByRole("button", { name: /Trabalho/ }))
    await userEvent.dblClick(screen.getByRole("button", { name: /Boards/ }))
    expect(usePcStore.getState().windows.map((w) => w.id)).toEqual(["boards"])
  })

  it("todo ícone da pasta abre — nenhum atalho morto no desktop", async () => {
    render(<DesktopIcons />)
    await userEvent.dblClick(screen.getByRole("button", { name: /Trabalho/ }))
    const meuDia = screen.getByRole("button", { name: /Meu Dia/ })
    expect(meuDia).toBeEnabled()
    await userEvent.dblClick(meuDia)
    expect(usePcStore.getState().windows.map((w) => w.id)).toEqual(["myday"])
  })

  it("Enter abre o ícone em foco — abrir não depende de duplo clique", async () => {
    render(<DesktopIcons />)
    await userEvent.dblClick(screen.getByRole("button", { name: /Trabalho/ }))
    screen.getByRole("button", { name: /Boards/ }).focus()
    await userEvent.keyboard("{Enter}")
    expect(usePcStore.getState().windows.map((w) => w.id)).toEqual(["boards"])
  })

  it("fechar a pasta volta para as pastas", async () => {
    render(<DesktopIcons />)
    await userEvent.dblClick(screen.getByRole("button", { name: /Comercial/ }))
    await userEvent.click(screen.getByRole("button", { name: "Fechar pasta" }))
    expect(usePcStore.getState().openFolderId).toBeNull()
  })
})
