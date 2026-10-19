import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useAgentKeys, useCreateAgentKey, useRevokeAgentKey } from "./agentKeys.hooks"
import { AgentKeysTab } from "./AgentKeysTab"

vi.mock("./agentKeys.hooks", () => ({
  useAgentKeys: vi.fn(),
  useCreateAgentKey: vi.fn(),
  useRevokeAgentKey: vi.fn(),
}))

const CHAVE = "t4e_agt_segredo-mostrado-uma-vez"
const create = vi.fn()
const revoke = vi.fn()

beforeEach(() => {
  create.mockReset()
  revoke.mockReset()
  vi.mocked(useAgentKeys).mockReturnValue({
    data: [
      { id: "leo-1", nome: "Leonardo", ativo: true, criado_em: "2026-10-19T10:00:00-03:00", ultimo_uso: null, criado_por: "Ana" },
      { id: "velha-2", nome: "Antiga", ativo: false, criado_em: "2026-09-01T10:00:00-03:00", ultimo_uso: "2026-09-02T10:00:00-03:00", criado_por: "Ana" },
    ],
    isLoading: false,
  } as never)
  vi.mocked(useCreateAgentKey).mockReturnValue({ mutate: create, isPending: false } as never)
  vi.mocked(useRevokeAgentKey).mockReturnValue({ mutate: revoke, isPending: false } as never)
})

describe("<AgentKeysTab />", () => {
  it("quem não é admin não vê nada da tela", () => {
    render(<AgentKeysTab workspaceId="ws" canManage={false} />)
    expect(screen.getByText(/apenas dono ou administrador/i)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /gerar chave/i })).not.toBeInTheDocument()
  })

  it("lista as chaves sem mostrar o valor e marca as revogadas", () => {
    render(<AgentKeysTab workspaceId="ws" canManage />)
    expect(screen.getByText("Leonardo")).toBeInTheDocument()
    expect(screen.getByText(/nunca usada/i)).toBeInTheDocument()
    const antiga = screen.getByText("Antiga").closest("li")!
    expect(within(antiga).getByText(/revogada/i)).toBeInTheDocument()
    expect(within(antiga).queryByRole("button", { name: /revogar/i })).not.toBeInTheDocument()
  })

  it("gera a chave e mostra uma única vez; fechou, sumiu", async () => {
    create.mockImplementation((_nome, opts) => opts.onSuccess({ id: "nova", nome: "Leonardo", chave: CHAVE }))
    render(<AgentKeysTab workspaceId="ws" canManage />)
    await userEvent.type(screen.getByLabelText(/nome da chave/i), "Leonardo")
    await userEvent.click(screen.getByRole("button", { name: /gerar chave/i }))
    expect(create).toHaveBeenCalledWith("Leonardo", expect.anything())

    expect(screen.getByDisplayValue(CHAVE)).toBeInTheDocument()
    expect(screen.getByText(/não será mostrada de novo/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: /já copiei/i }))
    expect(screen.queryByDisplayValue(CHAVE)).not.toBeInTheDocument()
    expect(document.body.textContent).not.toContain(CHAVE)
  })

  it("revogar pede confirmação", async () => {
    render(<AgentKeysTab workspaceId="ws" canManage />)
    await userEvent.click(screen.getByRole("button", { name: /revogar leonardo/i }))
    expect(revoke).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole("button", { name: /^revogar chave$/i }))
    expect(revoke).toHaveBeenCalledWith("leo-1", expect.anything())
  })
})
