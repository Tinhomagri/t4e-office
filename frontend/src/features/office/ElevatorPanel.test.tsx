import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it } from "vitest"

import { ElevatorPanel } from "./ElevatorPanel"
import { useWorldStore } from "./world.store"

const reset = () => useWorldStore.setState({ floor: 1, panelOpen: true })

describe("ElevatorPanel", () => {
  beforeEach(reset)

  it("não renderiza nada com o painel fechado", () => {
    useWorldStore.setState({ panelOpen: false })
    const { container } = render(<ElevatorPanel />)
    expect(container).toBeEmptyDOMElement()
  })

  it("lista os quatro andares, do mais alto para o mais baixo", () => {
    render(<ElevatorPanel />)
    const botoes = screen.getAllByRole("button", { name: /andar/i })
    expect(botoes).toHaveLength(4)
    expect(botoes[0]).toHaveAccessibleName(/4/)
    expect(botoes[3]).toHaveAccessibleName(/1/)
  })

  it("marca os andares em obras como desabilitados", () => {
    render(<ElevatorPanel />)
    expect(screen.getByRole("button", { name: /andar 2/i })).toBeDisabled()
    expect(screen.getAllByText(/em obras/i).length).toBeGreaterThan(0)
  })

  it("o andar atual aparece marcado e não é clicável", () => {
    render(<ElevatorPanel />)
    expect(screen.getByRole("button", { name: /andar 1/i })).toBeDisabled()
    expect(screen.getByText(/você está aqui/i)).toBeInTheDocument()
  })

  it("fechar limpa o painel no store", async () => {
    render(<ElevatorPanel />)
    await userEvent.click(screen.getByRole("button", { name: /fechar/i }))
    expect(useWorldStore.getState().panelOpen).toBe(false)
  })
})
