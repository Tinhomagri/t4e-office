import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const api = vi.hoisted(() => ({
  getProjectDevMetrics: vi.fn(),
  linkProjectRepo: vi.fn(),
  unlinkProjectRepo: vi.fn(),
}))

vi.mock("./github.api", () => api)
vi.mock("./GithubConnectRepo", () => ({ GithubConnectRepo: () => null }))

function Wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const { DevelopmentView } = await import("./DevelopmentView")

describe("<DevelopmentView />", () => {
  beforeEach(() => vi.clearAllMocks())

  it("mostra uma falha recuperável em vez de manter o projeto no skeleton", async () => {
    api.getProjectDevMetrics.mockRejectedValueOnce(
      new Error("Não foi possível carregar o projeto."),
    )
    render(
      <Wrapper>
        <DevelopmentView projectId="project-1" />
      </Wrapper>,
    )

    expect(await screen.findByText("Não foi possível carregar o projeto.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /tentar novamente/i })).toBeInTheDocument()
  })

  it("deixa o repositório vinculado acessível e identifica repositório de perfil", async () => {
    api.getProjectDevMetrics.mockResolvedValueOnce(metrics({
      full_name: "Tinhomagri/Tinhomagri",
      webhook_active: true,
    }))

    render(
      <Wrapper>
        <DevelopmentView projectId="project-1" />
      </Wrapper>,
    )

    const repo = await screen.findByRole("link", { name: /Tinhomagri\/Tinhomagri/i })
    expect(repo).toHaveAttribute("href", "https://github.com/Tinhomagri/Tinhomagri")
    expect(screen.getByText(/repositório de perfil/i)).toBeInTheDocument()
  })

  it("permite tentar ativar a sincronização de um vínculo sem webhook", async () => {
    const user = userEvent.setup()
    api.getProjectDevMetrics.mockResolvedValue(metrics({
      full_name: "acme/app",
      webhook_active: false,
    }))
    api.linkProjectRepo.mockResolvedValue({
      id: "repo-1",
      full_name: "acme/app",
      default_branch: "main",
      webhook_active: true,
    })

    render(
      <Wrapper>
        <DevelopmentView projectId="project-1" />
      </Wrapper>,
    )

    await user.click(await screen.findByRole("button", { name: /ativar sincronização/i }))
    expect(api.linkProjectRepo).toHaveBeenCalledWith("project-1", "acme/app")
  })

  it("explica quando o GitHub não permite ativar a sincronização", async () => {
    const user = userEvent.setup()
    api.getProjectDevMetrics.mockResolvedValue(metrics({
      full_name: "acme/app",
      webhook_active: false,
    }))
    api.linkProjectRepo.mockResolvedValue({
      id: "repo-1",
      full_name: "acme/app",
      default_branch: "main",
      webhook_active: false,
    })

    render(
      <Wrapper>
        <DevelopmentView projectId="project-1" />
      </Wrapper>,
    )

    await user.click(await screen.findByRole("button", { name: /ativar sincronização/i }))
    expect(await screen.findByText(/não foi possível ativar a sincronização/i)).toBeInTheDocument()
  })
})

function metrics(repo: { full_name: string; webhook_active: boolean }) {
  return {
    repos: [{ id: "repo-1", default_branch: "main", ...repo }],
    prs: { open: 0, merged: 0, closed: 0, total: 0 },
    branches: 0,
    commits: 0,
    linked_cards: 0,
    recent_prs: [],
  }
}
