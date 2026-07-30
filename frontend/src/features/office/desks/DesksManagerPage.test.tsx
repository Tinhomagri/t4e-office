import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useAuthStore } from "@/features/auth/auth.store"
import { useMembers, useWorkspaces } from "@/features/workspace/workspace.hooks"

import { useAssignDesk, useDeskAssignments } from "../pc/desks.hooks"
import { DesksManagerPage } from "./DesksManagerPage"

// Mocka os hooks de dados: o teste é sobre o que a página FAZ com owner/admin
// x member e com a mutation de atribuir, não sobre o react-query/API de
// verdade (mesmo padrão de mock usado nos outros testes de página do office).
vi.mock("@/features/workspace/workspace.hooks", () => ({
  useWorkspaces: vi.fn(),
  useMembers: vi.fn(),
}))

vi.mock("../pc/desks.hooks", () => ({
  useDeskAssignments: vi.fn(),
  useAssignDesk: vi.fn(),
}))

const WORKSPACE_ID = "ws-1"

const MEMBERS = [
  { user_id: "ana-1", name: "Ana Owner", email: "ana@t4e.com", role: "owner" as const },
  { user_id: "bob-2", name: "Bob Dev", email: "bob@t4e.com", role: "member" as const },
]

const mutate = vi.fn()

function setup({
  role,
  assignments = [],
}: {
  role: "owner" | "admin" | "member"
  assignments?: { seat_id: string; floor: number; user_id: string; user_name: string }[]
}) {
  useAuthStore.setState({ user: { id: "ana-1", full_name: "Ana Owner" } as never })

  vi.mocked(useWorkspaces).mockReturnValue({
    data: [{ id: WORKSPACE_ID, name: "WS", slug: "ws" }],
    isLoading: false,
    activeWorkspaceId: WORKSPACE_ID,
    setActiveWorkspace: vi.fn(),
  } as never)

  const members =
    role === "owner"
      ? MEMBERS
      : [{ ...MEMBERS[0], role }, MEMBERS[1]]
  vi.mocked(useMembers).mockReturnValue({ data: members } as never)

  vi.mocked(useDeskAssignments).mockReturnValue({ data: assignments } as never)
  vi.mocked(useAssignDesk).mockReturnValue({ mutate } as never)
}

beforeEach(() => {
  mutate.mockClear()
})

describe("<DesksManagerPage />", () => {
  it("owner/admin vê a lista das 30 mesas do andar 1", () => {
    setup({ role: "owner" })
    render(<DesksManagerPage />)
    expect(screen.getAllByText(/^Mesa \d+$/)).toHaveLength(30)
  })

  it("member comum vê 'Sem acesso' em vez da lista", () => {
    setup({ role: "member" })
    render(<DesksManagerPage />)
    expect(screen.getByText(/sem acesso/i)).toBeInTheDocument()
    expect(screen.queryByText(/^Mesa 1$/)).not.toBeInTheDocument()
  })

  it("escolher um membro no <select> de uma mesa chama a mutation com seatId/userId certos", async () => {
    setup({ role: "owner" })
    render(<DesksManagerPage />)

    const selects = screen.getAllByRole("combobox")
    await userEvent.selectOptions(selects[0], "bob-2")

    expect(mutate).toHaveBeenCalledTimes(1)
    const arg = mutate.mock.calls[0][0]
    expect(arg.userId).toBe("bob-2")
    expect(typeof arg.seatId).toBe("string")
    expect(arg.seatId.length).toBeGreaterThan(0)
  })
})
