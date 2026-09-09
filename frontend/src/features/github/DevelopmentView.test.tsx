import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"

vi.mock("./github.api", () => ({
  getProjectDevMetrics: vi.fn(async () => {
    throw new Error("Não foi possível carregar o projeto.")
  }),
  unlinkProjectRepo: vi.fn(),
}))
vi.mock("./GithubConnectRepo", () => ({ GithubConnectRepo: () => null }))

function Wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const { DevelopmentView } = await import("./DevelopmentView")

describe("<DevelopmentView />", () => {
  it("mostra uma falha recuperável em vez de manter o projeto no skeleton", async () => {
    render(
      <Wrapper>
        <DevelopmentView projectId="project-1" />
      </Wrapper>,
    )

    expect(await screen.findByText("Não foi possível carregar o projeto.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /tentar novamente/i })).toBeInTheDocument()
  })
})
