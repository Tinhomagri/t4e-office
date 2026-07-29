import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useAuthStore } from "@/features/auth/auth.store"
import { useWorkspaces } from "@/features/workspace/workspace.hooks"

import { useActiveCard, useSaveWorkingNote } from "../pc/activeCard.hooks"
import { MyCardPage } from "./MyCardPage"

vi.mock("@/features/workspace/workspace.hooks", () => ({
  useWorkspaces: vi.fn(),
}))

vi.mock("../pc/activeCard.hooks", () => ({
  useActiveCard: vi.fn(),
  useSaveWorkingNote: vi.fn(),
}))

const WORKSPACE_ID = "ws-1"
const mutate = vi.fn()

function setup(activeCardData: unknown) {
  useAuthStore.setState({ user: { id: "bob-2", full_name: "Bob Dev" } as never })
  vi.mocked(useWorkspaces).mockReturnValue({
    data: [{ id: WORKSPACE_ID, name: "WS", slug: "ws" }],
    isLoading: false,
    activeWorkspaceId: WORKSPACE_ID,
    setActiveWorkspace: vi.fn(),
  } as never)
  vi.mocked(useActiveCard).mockReturnValue({ data: activeCardData, isLoading: false } as never)
  vi.mocked(useSaveWorkingNote).mockReturnValue({ mutate } as never)
}

beforeEach(() => {
  mutate.mockClear()
})

describe("<MyCardPage />", () => {
  it("sem card doing mostra estado vazio", () => {
    setup({ active: false })
    render(<MyCardPage />)
    expect(screen.getByText(/não tem nenhum card em andamento/i)).toBeInTheDocument()
  })

  it("com card doing mostra título e textarea preenchida com a observação", () => {
    setup({
      active: true,
      card: { id: "card-1", number: 5, title: "Ajustar layout", project: "MIA" },
      doing_since: new Date().toISOString(),
      working_note: "quase terminando",
    })
    render(<MyCardPage />)
    expect(screen.getByText(/MIA-5/)).toBeInTheDocument()
    expect(screen.getByText(/ajustar layout/i)).toBeInTheDocument()
    expect(screen.getByRole("textbox")).toHaveValue("quase terminando")
  })

  it("salvar chama a mutation com cardId e o texto digitado", async () => {
    setup({
      active: true,
      card: { id: "card-1", number: 5, title: "Ajustar layout", project: "MIA" },
      doing_since: new Date().toISOString(),
      working_note: "",
    })
    render(<MyCardPage />)
    await userEvent.type(screen.getByRole("textbox"), "travado")
    await userEvent.click(screen.getByRole("button", { name: /salvar/i }))
    expect(mutate).toHaveBeenCalledWith({ cardId: "card-1", note: "travado" })
  })
})
