import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"

import type { Deal, PipelineStage } from "../sales.types"

// A API real ainda não existe: o smoke test cobre a renderização do Kanban a
// partir do cache do react-query, não o transporte HTTP.
vi.mock("../sales.api", () => ({
  listStages: vi.fn(async () => STAGES),
  listDeals: vi.fn(async () => DEALS),
  listCustomers: vi.fn(async () => []),
  moveDealStage: vi.fn(async () => DEALS[0]),
  createDeal: vi.fn(),
  listDealActivities: vi.fn(async () => []),
  listDealHistory: vi.fn(async () => []),
}))

const STAGES: PipelineStage[] = [
  {
    id: "s1",
    workspace_id: "w1",
    name: "Lead",
    slug: "lead",
    color: "#94a3b8",
    order: 0,
    probability_default: 10,
    kind: "open",
  },
  {
    id: "s2",
    workspace_id: "w1",
    name: "Proposta",
    slug: "proposta",
    color: "#2563eb",
    order: 1,
    probability_default: 50,
    kind: "open",
  },
]

function makeDeal(over: Partial<Deal>): Deal {
  return {
    id: "d1",
    workspace_id: "w1",
    title: "Negócio",
    customer_id: "c1",
    customer_name: "Acme",
    contact_id: null,
    stage_id: "s1",
    amount: "1000",
    currency: "BRL",
    probability: 10,
    expected_close_date: null,
    source: "",
    owner_id: null,
    lost_reason: "",
    lost_notes: "",
    won_at: null,
    lost_at: null,
    delivery_project_id: null,
    rank: "a",
    created_at: "2026-07-01T12:00:00Z",
    updated_at: "2026-07-01T12:00:00Z",
    ...over,
  }
}

const DEALS: Deal[] = [
  makeDeal({ id: "d1", title: "Portal do cliente", stage_id: "s1", amount: "10000", probability: 10 }),
  makeDeal({ id: "d2", title: "App de campo", stage_id: "s2", amount: "40000", probability: 50 }),
]

// eslint-disable-next-line react-refresh/only-export-components
function Wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

// Import depois do mock para o módulo pegar a versão mockada da API.
const { PipelineView } = await import("./PipelineView")

describe("<PipelineView />", () => {
  it("renderiza uma coluna por estágio, com contagem e somas", async () => {
    render(
      <Wrapper>
        <PipelineView workspaceId="w1" />
      </Wrapper>,
    )

    expect(await screen.findByText("Lead")).toBeInTheDocument()
    expect(screen.getByText("Proposta")).toBeInTheDocument()

    // Soma ponderada do funil: 10000×10% + 40000×50% = 21.000
    expect(screen.getByText("Previsão ponderada")).toBeInTheDocument()
    expect(screen.getAllByText(/21\.000/).length).toBeGreaterThan(0)
  })

  it("renderiza os cards dos negócios em suas colunas", async () => {
    render(
      <Wrapper>
        <PipelineView workspaceId="w1" />
      </Wrapper>,
    )

    expect(await screen.findByText("Portal do cliente")).toBeInTheDocument()
    expect(screen.getByText("App de campo")).toBeInTheDocument()
    expect(screen.getAllByText("Acme").length).toBe(2)
  })

  it("oferece o botão de criar negócio em cada coluna", async () => {
    render(
      <Wrapper>
        <PipelineView workspaceId="w1" />
      </Wrapper>,
    )

    expect(await screen.findByRole("button", { name: /novo negócio em lead/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /novo negócio em proposta/i })).toBeInTheDocument()
  })
})
