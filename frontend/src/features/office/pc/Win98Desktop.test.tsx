import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"

import { usePcStore } from "./pc.store"
import { Win98Desktop } from "./Win98Desktop"

const ligado = () => {
  usePcStore.getState().shutdown()
  usePcStore.getState().boot("ws-26-9")
  usePcStore.getState().ready()
}

// O app "boards" usa react-query de verdade; sem provider ele quebra o render.
// Isso é sobre o ambiente de teste, não sobre o Win98Desktop — as demais telas
// não vêm daqui.
const renderComQueryClient = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <Win98Desktop />
    </QueryClientProvider>,
  )
}

beforeEach(() => usePcStore.getState().shutdown())

describe("<Win98Desktop />", () => {
  it("desligado, não renderiza nada", () => {
    const { container } = render(<Win98Desktop />)
    expect(container).toBeEmptyDOMElement()
  })

  it("em booting mostra a tela de boot e nenhuma taskbar", () => {
    usePcStore.getState().boot("ws-26-9")
    render(<Win98Desktop />)
    expect(screen.getByTestId("boot-screen")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Iniciar" })).not.toBeInTheDocument()
  })

  it("em desktop mostra painel, ícones e taskbar", () => {
    ligado()
    render(<Win98Desktop />)
    expect(screen.getByTestId("win98-panel")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Trabalho/ })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Iniciar" })).toBeInTheDocument()
  })

  it("o painel não usa transform — é o que mantém os modais das páginas no lugar", () => {
    ligado()
    render(<Win98Desktop />)
    const panel = screen.getByTestId("win98-panel")
    expect(panel.style.transform).toBe("")
    expect(getComputedStyle(panel).transform === "none" || getComputedStyle(panel).transform === "").toBe(true)
  })

  it("janela aberta renderiza o conteúdo do app dentro dela", () => {
    ligado()
    usePcStore.getState().openApp("boards", { w: 600, h: 400 })
    renderComQueryClient()
    expect(screen.getByTestId("win98-titlebar")).toBeInTheDocument()
  })

  it("app sem componente registrado mostra aviso em vez de tela branca", () => {
    ligado()
    usePcStore.getState().openApp("poker", { w: 600, h: 400 })
    render(<Win98Desktop />)
    expect(screen.getByText(/Em breve/)).toBeInTheDocument()
  })

  it("janela expandida vai para a camada de tela cheia, fora do painel", () => {
    ligado()
    usePcStore.getState().openApp("boards", { w: 600, h: 400 })
    usePcStore.getState().expand("boards")
    renderComQueryClient()
    const camada = screen.getByTestId("win98-expanded")
    expect(camada).toBeInTheDocument()
    expect(camada.style.transform).toBe("")
    expect(screen.getByTestId("win98-panel").contains(camada)).toBe(false)
  })

  it("expandida deixa exatamente uma taskbar no DOM", () => {
    ligado()
    usePcStore.getState().openApp("boards", { w: 600, h: 400 })
    renderComQueryClient()
    expect(screen.getAllByRole("button", { name: "Iniciar" })).toHaveLength(1)

    act(() => usePcStore.getState().expand("boards"))
    expect(screen.getAllByRole("button", { name: "Iniciar" })).toHaveLength(1)
    expect(screen.getAllByRole("button", { name: "Levantar" })).toHaveLength(1)
  })
})
