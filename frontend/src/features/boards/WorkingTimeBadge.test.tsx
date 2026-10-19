import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useSetCardPaused } from "@/features/workspace/workspace.hooks"

import { WorkingTimeBadge } from "./WorkingTimeBadge"

vi.mock("@/features/workspace/workspace.hooks", () => ({
  useSetCardPaused: vi.fn(),
}))

const mutate = vi.fn()

beforeEach(() => {
  mutate.mockClear()
  vi.mocked(useSetCardPaused).mockReturnValue({ mutate, isPending: false } as never)
})

const base = { id: "c1", project_id: "p1", worked_seconds: 5400 }

describe("<WorkingTimeBadge />", () => {
  it("card fora de andamento não mostra nada", () => {
    const { container } = render(
      <WorkingTimeBadge card={{ ...base, doing_since: null, paused_at: null }} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it("rodando: mostra o tempo e o clique pausa", async () => {
    render(
      <WorkingTimeBadge
        card={{ ...base, doing_since: new Date().toISOString(), paused_at: null }}
      />,
    )
    const button = screen.getByRole("button", { name: /pausar/i })
    expect(button).toHaveTextContent("1h 30min")
    await userEvent.click(button)
    expect(mutate).toHaveBeenCalledWith(
      { cardId: "c1", paused: true },
      expect.anything(),
    )
  })

  it("pausado: mostra 'Pausado' e o clique retoma", async () => {
    render(
      <WorkingTimeBadge
        card={{ ...base, doing_since: null, paused_at: new Date().toISOString() }}
      />,
    )
    const button = screen.getByRole("button", { name: /retomar/i })
    expect(button).toHaveTextContent(/pausado/i)
    expect(button).toHaveTextContent("1h 30min")
    await userEvent.click(button)
    expect(mutate).toHaveBeenCalledWith(
      { cardId: "c1", paused: false },
      expect.anything(),
    )
  })

  it("só leitura (clone do arrasto): sem botão", () => {
    render(
      <WorkingTimeBadge
        readOnly
        card={{ ...base, doing_since: new Date().toISOString(), paused_at: null }}
      />,
    )
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
    expect(screen.getByText("1h 30min")).toBeInTheDocument()
  })

  it("bloqueado: mostra 'Bloqueado' sem botão (pausar não resolve bloqueio)", () => {
    render(
      <WorkingTimeBadge
        card={{ ...base, doing_since: null, paused_at: null, blocked_in_progress: true }}
      />,
    )
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
    expect(screen.getByText(/bloqueado/i)).toBeInTheDocument()
    expect(screen.getByText("1h 30min")).toBeInTheDocument()
  })
})
