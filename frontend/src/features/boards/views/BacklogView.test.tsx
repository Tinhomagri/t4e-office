import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { Card, Sprint } from "@/features/workspace/workspace.types"

vi.mock("@/features/workspace/workspace.api", () => ({
  updateCard: vi.fn(async (cardId: string) => ({ id: cardId })),
  listEpics: vi.fn(async () => []),
  createSprint: vi.fn(),
  startSprint: vi.fn(),
  completeSprint: vi.fn(),
  rankCard: vi.fn(),
}))

const { updateCard } = await import("@/features/workspace/workspace.api")
const { BacklogView } = await import("./BacklogView")

function makeCard(over: Partial<Card>): Card {
  return {
    id: "c1",
    ref: "PRJ-1",
    project_id: "p1",
    title: "Card",
    description: "",
    status: "backlog",
    type: "feature",
    priority: "medium",
    points: null,
    order: 0,
    source: "manual",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    assignee_id: null,
    sprint_id: null,
    due_date: null,
    reporter_id: null,
    start_date: null,
    labels: [],
    parent_id: null,
    epic_id: null,
    epic_color: "",
    rank: "a",
    channel: "",
    publish_date: null,
    flagged: false,
    reporter_name: "",
    ...over,
  } as Card
}

const SPRINTS: Sprint[] = [
  {
    id: "s1",
    project_id: "p1",
    name: "Sprint 1",
    goal: "",
    status: "active",
    start_date: null,
    end_date: null,
  },
]

// eslint-disable-next-line react-refresh/only-export-components
function Wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe("<BacklogView /> seleção múltipla", () => {
  beforeEach(() => {
    vi.mocked(updateCard).mockClear()
  })

  it("mostra a barra de ação só depois de selecionar algum card do backlog", async () => {
    const cards = [makeCard({ id: "c1", title: "Card um" }), makeCard({ id: "c2", title: "Card dois" })]
    render(
      <Wrapper>
        <BacklogView projectId="p1" cards={cards} sprints={SPRINTS} members={[]} onOpen={() => {}} />
      </Wrapper>,
    )

    expect(await screen.findByText("Card um")).toBeInTheDocument()
    expect(screen.queryByText(/selecionado/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("checkbox", { name: /selecionar card um/i }))

    expect(screen.getByText(/1 selecionado/)).toBeInTheDocument()
  })

  it("mover em massa chama updateCard uma vez por card selecionado com a sprint escolhida", async () => {
    const cards = [makeCard({ id: "c1", title: "Card um" }), makeCard({ id: "c2", title: "Card dois" })]
    render(
      <Wrapper>
        <BacklogView projectId="p1" cards={cards} sprints={SPRINTS} members={[]} onOpen={() => {}} />
      </Wrapper>,
    )

    await screen.findByText("Card um")
    fireEvent.click(screen.getByRole("checkbox", { name: /selecionar card um/i }))
    fireEvent.click(screen.getByRole("checkbox", { name: /selecionar card dois/i }))

    fireEvent.change(screen.getByLabelText(/mover selecionados para/i), { target: { value: "s1" } })
    fireEvent.click(screen.getByRole("button", { name: /mover/i }))

    await vi.waitFor(() => {
      expect(updateCard).toHaveBeenCalledTimes(2)
    })
    expect(updateCard).toHaveBeenCalledWith("c1", { sprint_id: "s1" })
    expect(updateCard).toHaveBeenCalledWith("c2", { sprint_id: "s1" })

    await vi.waitFor(() => {
      expect(screen.queryByText(/selecionado/)).not.toBeInTheDocument()
    })
  })

  it("cancelar limpa a seleção sem mover nada", async () => {
    const cards = [makeCard({ id: "c1", title: "Card um" })]
    render(
      <Wrapper>
        <BacklogView projectId="p1" cards={cards} sprints={SPRINTS} members={[]} onOpen={() => {}} />
      </Wrapper>,
    )

    await screen.findByText("Card um")
    fireEvent.click(screen.getByRole("checkbox", { name: /selecionar card um/i }))
    expect(screen.getByText(/1 selecionado/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: /cancelar/i }))

    expect(screen.queryByText(/selecionado/)).not.toBeInTheDocument()
    expect(updateCard).not.toHaveBeenCalled()
  })
})
