import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import { createElement as h, type ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useAuthStore } from "@/features/auth/auth.store"
import * as wsApi from "@/features/workspace/workspace.api"
import type { Member } from "@/features/workspace/workspace.types"

import { useMySpaceIds } from "./spaceAccess"

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return h(QueryClientProvider, { client: qc }, children)
}

function setMembers(members: Member[]) {
  vi.spyOn(wsApi, "listMembers").mockResolvedValue(members)
}

afterEach(() => {
  vi.restoreAllMocks()
  useAuthStore.setState({ user: null })
})

describe("useMySpaceIds", () => {
  it("sem workspaceId, devolve lista vazia (falha fechado)", () => {
    const { result } = renderHook(() => useMySpaceIds(null), { wrapper })
    expect(result.current).toEqual([])
  })

  it("enquanto a membership não carregou, devolve lista vazia", () => {
    setMembers([])
    const { result } = renderHook(() => useMySpaceIds("ws1"), { wrapper })
    expect(result.current).toEqual([])
  })

  it("owner sempre vê todos os spaces, mesmo com allowed_spaces restrito", async () => {
    useAuthStore.setState({ user: { id: "u1" } as any })
    setMembers([
      { user_id: "u1", name: "Ana", email: "a@a.com", role: "owner", allowed_spaces: ["boards"] },
    ])
    const { result } = renderHook(() => useMySpaceIds("ws1"), { wrapper })
    await waitFor(() => expect(result.current).toEqual(["boards", "marketing", "comercial"]))
  })

  it("admin vê somente os spaces liberados pelo dono", async () => {
    useAuthStore.setState({ user: { id: "u1" } as any })
    setMembers([
      { user_id: "u1", name: "Ana", email: "a@a.com", role: "admin", allowed_spaces: ["marketing"] },
    ])
    const { result } = renderHook(() => useMySpaceIds("ws1"), { wrapper })
    await waitFor(() => expect(result.current).toEqual(["marketing"]))
  })

  it("admin ou membro legado sem lista não vê nenhum space", async () => {
    useAuthStore.setState({ user: { id: "u1" } as any })
    setMembers([
      { user_id: "u1", name: "Ana", email: "a@a.com", role: "member", allowed_spaces: null },
    ])
    const { result } = renderHook(() => useMySpaceIds("ws1"), { wrapper })
    await waitFor(() => expect(wsApi.listMembers).toHaveBeenCalled())
    expect(result.current).toEqual([])
  })

  it("member com allowed_spaces [] não vê nada", async () => {
    useAuthStore.setState({ user: { id: "u1" } as any })
    setMembers([
      { user_id: "u1", name: "Ana", email: "a@a.com", role: "member", allowed_spaces: [] },
    ])
    const { result } = renderHook(() => useMySpaceIds("ws1"), { wrapper })
    await waitFor(() => expect(wsApi.listMembers).toHaveBeenCalled())
    expect(result.current).toEqual([])
  })

  it("member com lista restrita vê só o que está na lista, filtrado contra ids válidos", async () => {
    useAuthStore.setState({ user: { id: "u1" } as any })
    setMembers([
      {
        user_id: "u1",
        name: "Ana",
        email: "a@a.com",
        role: "member",
        allowed_spaces: ["boards", "stale-space"],
      },
    ])
    const { result } = renderHook(() => useMySpaceIds("ws1"), { wrapper })
    await waitFor(() => expect(result.current).toEqual(["boards"]))
  })

  it("usuário que não está na lista de membros devolve lista vazia", async () => {
    useAuthStore.setState({ user: { id: "u2" } as any })
    setMembers([
      { user_id: "u1", name: "Ana", email: "a@a.com", role: "member", allowed_spaces: null },
    ])
    const { result } = renderHook(() => useMySpaceIds("ws1"), { wrapper })
    await waitFor(() => expect(wsApi.listMembers).toHaveBeenCalled())
    expect(result.current).toEqual([])
  })
})
