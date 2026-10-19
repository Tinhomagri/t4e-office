import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { Sprint } from "@/features/workspace/workspace.types"

import { CompleteSprintModal, EditSprintModal, StartSprintModal } from "./SprintDialogs"

const base: Sprint = {
  id: "s1",
  project_id: "p1",
  name: "Sprint 12",
  goal: "",
  start_date: null,
  end_date: null,
  status: "planned",
  duration_days: null,
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date(2026, 9, 19, 10, 0)) // segunda, 19/10/2026
})
afterEach(() => vi.useRealTimers())

describe("<StartSprintModal />", () => {
  it("vem com hoje + 2 semanas e manda nome, datas e meta", async () => {
    const onConfirm = vi.fn()
    render(<StartSprintModal sprint={base} cardCount={3} onCancel={vi.fn()} onConfirm={onConfirm} />)
    expect(screen.getByText(/3 cards/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/data de início/i)).toHaveValue("2026-10-19")
    expect(screen.getByLabelText(/data de fim/i)).toHaveValue("2026-11-01")
    expect(screen.getByRole("button", { name: "2 semanas" })).toHaveAttribute("aria-pressed", "true")

    const goal = screen.getByLabelText(/meta/i)
    await userEvent.type(goal, "Checkout no ar")
    await userEvent.click(screen.getByRole("button", { name: /^iniciar$/i }))
    expect(onConfirm).toHaveBeenCalledWith({
      name: "Sprint 12",
      start_date: "2026-10-19",
      end_date: "2026-11-01",
      goal: "Checkout no ar",
      duration_days: 14,
    })
  })

  it("trocar a duração recalcula o fim; mexer no fim vira personalizada", async () => {
    render(<StartSprintModal sprint={base} cardCount={1} onCancel={vi.fn()} onConfirm={vi.fn()} />)
    await userEvent.click(screen.getByRole("button", { name: "4 semanas" }))
    expect(screen.getByLabelText(/data de fim/i)).toHaveValue("2026-11-15")

    const end = screen.getByLabelText(/data de fim/i)
    await userEvent.clear(end)
    await userEvent.type(end, "2026-10-30")
    expect(screen.getByRole("button", { name: "Personalizada" })).toHaveAttribute("aria-pressed", "true")
  })

  it("fim antes do início bloqueia o botão e explica", async () => {
    render(<StartSprintModal sprint={base} cardCount={1} onCancel={vi.fn()} onConfirm={vi.fn()} />)
    const end = screen.getByLabelText(/data de fim/i)
    await userEvent.clear(end)
    await userEvent.type(end, "2026-10-01")
    expect(screen.getByText(/fim não pode ser anterior/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /^iniciar$/i })).toBeDisabled()
  })

  it("data de fim editada à mão manda duração personalizada (null)", async () => {
    const onConfirm = vi.fn()
    render(<StartSprintModal sprint={base} cardCount={1} onCancel={vi.fn()} onConfirm={onConfirm} />)
    const end = screen.getByLabelText(/data de fim/i)
    await userEvent.clear(end)
    await userEvent.type(end, "2026-10-30")
    await userEvent.click(screen.getByRole("button", { name: /^iniciar$/i }))
    expect(onConfirm.mock.calls[0][0]).toMatchObject({ end_date: "2026-10-30", duration_days: null })
  })

  it("usa a duração escolhida na criação da sprint", () => {
    render(
      <StartSprintModal sprint={{ ...base, duration_days: 21 }} cardCount={1} onCancel={vi.fn()} onConfirm={vi.fn()} />,
    )
    expect(screen.getByRole("button", { name: "3 semanas" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByLabelText(/data de fim/i)).toHaveValue("2026-11-08")
  })

  it("usa as datas já planejadas da sprint", () => {
    render(
      <StartSprintModal
        sprint={{ ...base, start_date: "2026-10-26", end_date: "2026-11-01" }}
        cardCount={1}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )
    expect(screen.getByLabelText(/data de início/i)).toHaveValue("2026-10-26")
    expect(screen.getByRole("button", { name: "1 semana" })).toHaveAttribute("aria-pressed", "true")
  })
})

describe("<EditSprintModal />", () => {
  it("edita nome, meta e datas", async () => {
    const onConfirm = vi.fn()
    render(
      <EditSprintModal
        sprint={{ ...base, status: "active", start_date: "2026-10-12", end_date: "2026-10-25", goal: "A" }}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    )
    const name = screen.getByLabelText(/nome/i)
    await userEvent.clear(name)
    await userEvent.type(name, "Sprint 12b")
    await userEvent.click(screen.getByRole("button", { name: "3 semanas" }))
    await userEvent.click(screen.getByRole("button", { name: /salvar/i }))
    expect(onConfirm).toHaveBeenCalledWith({
      name: "Sprint 12b",
      start_date: "2026-10-12",
      end_date: "2026-11-01",
      goal: "A",
      duration_days: 21,
    })
  })

  it("nome vazio não salva", async () => {
    render(<EditSprintModal sprint={base} onCancel={vi.fn()} onConfirm={vi.fn()} />)
    await userEvent.clear(screen.getByLabelText(/nome/i))
    expect(screen.getByRole("button", { name: /salvar/i })).toBeDisabled()
  })
})

describe("<CompleteSprintModal />", () => {
  const preview = { completed_cards: 5, open_cards: 2, suggested_name: "Sprint 13" }

  it("mostra concluídos × abertos e manda para nova sprint com o nome sugerido", async () => {
    const onConfirm = vi.fn()
    render(
      <CompleteSprintModal
        sprint={{ ...base, status: "active" }}
        openSprints={[{ ...base, id: "s2", name: "Sprint 14" }]}
        preview={preview}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    )
    expect(screen.getByText(/5 cards concluídos/i)).toBeInTheDocument()
    expect(screen.getByText(/2 cards abertos/i)).toBeInTheDocument()
    await userEvent.click(screen.getByLabelText(/nova sprint/i))
    expect(screen.getByLabelText(/nome da nova sprint/i)).toHaveValue("Sprint 13")
    await userEvent.click(screen.getByRole("button", { name: /concluir sprint/i }))
    expect(onConfirm).toHaveBeenCalledWith({ moveTo: "new", newSprintName: "Sprint 13" })
  })

  it("pode mandar para sprint existente", async () => {
    const onConfirm = vi.fn()
    render(
      <CompleteSprintModal
        sprint={{ ...base, status: "active" }}
        openSprints={[{ ...base, id: "s2", name: "Sprint 14" }]}
        preview={preview}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    )
    await userEvent.click(screen.getByLabelText("Sprint 14"))
    await userEvent.click(screen.getByRole("button", { name: /concluir sprint/i }))
    expect(onConfirm).toHaveBeenCalledWith({ moveTo: "s2" })
  })

  it("sem cards abertos não pergunta destino", () => {
    render(
      <CompleteSprintModal
        sprint={{ ...base, status: "active" }}
        openSprints={[]}
        preview={{ ...preview, open_cards: 0 }}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )
    expect(screen.queryByLabelText(/backlog/i)).not.toBeInTheDocument()
    expect(screen.getByText(/todos os cards foram concluídos/i)).toBeInTheDocument()
  })
})
