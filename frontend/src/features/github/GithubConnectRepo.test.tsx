import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const api = vi.hoisted(() => ({
  getGithubAuthUrl: vi.fn(),
  getGithubStatus: vi.fn(),
  linkProjectRepo: vi.fn(),
  listMyRepos: vi.fn(),
}))

vi.mock("./github.api", () => api)

function Wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const { GithubConnectRepo } = await import("./GithubConnectRepo")

describe("<GithubConnectRepo />", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.getGithubStatus.mockResolvedValue({ connected: true, login: "octocat" })
    api.listMyRepos.mockResolvedValue([
      {
        full_name: "octocat/profile",
        private: false,
        default_branch: "main",
        admin: true,
        push: true,
      },
      {
        full_name: "octocat/app",
        private: false,
        default_branch: "main",
        admin: true,
        push: true,
      },
    ])
  })

  it("remove os repositórios já vinculados da seleção", async () => {
    render(
      <Wrapper>
        <GithubConnectRepo projectId="project-1" linkedRepos={["octocat/profile"]} />
      </Wrapper>,
    )

    const select = await screen.findByRole("combobox")
    expect(select).not.toHaveTextContent("octocat/profile")
    expect(select).toHaveTextContent("octocat/app")
  })

  it("limpa a seleção e confirma quando o vínculo termina", async () => {
    const user = userEvent.setup()
    api.linkProjectRepo.mockResolvedValue({
      id: "repo-1",
      full_name: "octocat/app",
      default_branch: "main",
      webhook_active: true,
    })
    render(
      <Wrapper>
        <GithubConnectRepo projectId="project-1" />
      </Wrapper>,
    )

    const select = await screen.findByRole("combobox")
    await user.selectOptions(select, "octocat/app")

    expect(await screen.findByText(/octocat\/app vinculado com sincronização ativa/i)).toBeInTheDocument()
    expect(select).toHaveValue("")
  })

  it("oferece reconexão quando a conta conectada não consegue listar repositórios", async () => {
    api.listMyRepos.mockRejectedValueOnce(
      new Error("Sua conexão com o GitHub expirou. Conecte novamente."),
    )

    render(
      <Wrapper>
        <GithubConnectRepo projectId="project-1" />
      </Wrapper>,
    )

    expect(
      await screen.findByText("Sua conexão com o GitHub expirou. Conecte novamente."),
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /reconectar github/i })).toBeInTheDocument()
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument()
  })
})
