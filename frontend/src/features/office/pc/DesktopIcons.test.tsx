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

  it("app desabilitado não abre e avisa que vem depois", async () => {
    render(<DesktopIcons />)
    await userEvent.dblClick(screen.getByRole("button", { name: /Trabalho/ }))
    const meuDia = screen.getByRole("button", { name: /Meu Dia/ })
    expect(meuDia).toBeDisabled()
    expect(meuDia).toHaveAttribute("title", "Em breve")
    await userEvent.dblClick(meuDia)
    expect(usePcStore.getState().windows).toHaveLength(0)
  })

  it("fechar a pasta volta para as pastas", async () => {
    render(<DesktopIcons />)
    await userEvent.dblClick(screen.getByRole("button", { name: /Comercial/ }))
    await userEvent.click(screen.getByRole("button", { name: "Fechar pasta" }))
    expect(usePcStore.getState().openFolderId).toBeNull()
  })
})
