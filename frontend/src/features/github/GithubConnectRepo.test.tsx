import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"

vi.mock("./github.api", () => ({
  getGithubStatus: vi.fn(async () => ({ connected: true, login: "octocat" })),
  listMyRepos: vi.fn(async () => {
    throw new Error("Sua conexão com o GitHub expirou. Conecte novamente.")
  }),
  getGithubAuthUrl: vi.fn(async () => "https://github.com/login/oauth/authorize"),
  linkProjectRepo: vi.fn(),
}))

function Wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const { GithubConnectRepo } = await import("./GithubConnectRepo")

describe("<GithubConnectRepo />", () => {
  it("oferece reconexão quando a conta conectada não consegue listar repositórios", async () => {
    render(
      <Wrapper>
        <GithubConnectRepo projectId="project-1" />
      </Wrapper>,
    )

    expect(
      await screen.findByText("Sua conexão com o GitHub expirou. Conecte novamente."),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /reconectar github/i }),
    ).toBeInTheDocument()
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument()
  })
})
