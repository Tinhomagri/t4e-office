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

function setup(activeCardData: unknown, saveNoteState: { isError?: boolean } = {}) {
  useAuthStore.setState({ user: { id: "bob-2", full_name: "Bob Dev" } as never })
  vi.mocked(useWorkspaces).mockReturnValue({
    data: [{ id: WORKSPACE_ID, name: "WS", slug: "ws" }],
    isLoading: false,
    activeWorkspaceId: WORKSPACE_ID,
    setActiveWorkspace: vi.fn(),
  } as never)
  vi.mocked(useActiveCard).mockReturnValue({ data: activeCardData, isLoading: false } as never)
  vi.mocked(useSaveWorkingNote).mockReturnValue({
    mutate,
    isError: saveNoteState.isError ?? false,
  } as never)
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
    expect(mutate).toHaveBeenCalledWith(
      { cardId: "card-1", note: "travado" },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
  })

  it("mantém o texto digitado na textarea enquanto o salvamento ainda está pendente", async () => {
    setup({
      active: true,
      card: { id: "card-1", number: 5, title: "Ajustar layout", project: "MIA" },
      doing_since: new Date().toISOString(),
      working_note: "nota antiga",
    })
    // simula um save em andamento: mutate NÃO invoca onSuccess sincronamente
    mutate.mockImplementation(() => {})
    render(<MyCardPage />)
    const textarea = screen.getByRole("textbox")
    await userEvent.clear(textarea)
    await userEvent.type(textarea, "nota nova")
    await userEvent.click(screen.getByRole("button", { name: /salvar/i }))
    expect(textarea).toHaveValue("nota nova")
  })

  it("limpa o estado dirty quando o save realmente sucede (onSuccess invocado)", async () => {
    setup({
      active: true,
      card: { id: "card-1", number: 5, title: "Ajustar layout", project: "MIA" },
      doing_since: new Date().toISOString(),
      working_note: "nota antiga",
    })
    mutate.mockImplementation((_vars, opts) => {
      opts?.onSuccess?.()
    })
    render(<MyCardPage />)
    const textarea = screen.getByRole("textbox")
    await userEvent.clear(textarea)
    await userEvent.type(textarea, "nota nova")
    await userEvent.click(screen.getByRole("button", { name: /salvar/i }))
    // onSuccess já disparou (dirty=false), então volta a refletir working_note
    // do cache — igual ao app real antes do refetch popular o novo valor.
    expect(textarea).toHaveValue("nota antiga")
  })

  it("mostra mensagem de erro quando o save falha", () => {
    setup(
      {
        active: true,
        card: { id: "card-1", number: 5, title: "Ajustar layout", project: "MIA" },
        doing_since: new Date().toISOString(),
        working_note: "nota",
      },
      { isError: true },
    )
    render(<MyCardPage />)
    expect(screen.getByText(/erro ao salvar/i)).toBeInTheDocument()
  })
})
