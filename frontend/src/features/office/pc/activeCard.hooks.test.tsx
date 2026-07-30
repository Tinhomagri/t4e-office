import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import * as api from "@/shared/api/client"

import { useActiveCard } from "./activeCard.hooks"

vi.mock("@/shared/api/client", () => ({
  api: { get: vi.fn(), patch: vi.fn() },
}))

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

beforeEach(() => {
  vi.mocked(api.api.get).mockReset()
})

describe("useActiveCard", () => {
  it("busca o endpoint certo quando enabled=true", async () => {
    vi.mocked(api.api.get).mockResolvedValue({ data: { active: false } })
    const { result } = renderHook(() => useActiveCard("ws-1", "user-1", true), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(api.api.get).toHaveBeenCalledWith("/presence/active-card/", {
      params: { workspace_id: "ws-1", user_id: "user-1" },
    })
    expect(result.current.data).toEqual({ active: false })
  })

  it("não busca nada quando enabled=false", () => {
    renderHook(() => useActiveCard("ws-1", "user-1", false), { wrapper })
    expect(api.api.get).not.toHaveBeenCalled()
  })

  it("não busca nada sem userId, mesmo com enabled=true", () => {
    renderHook(() => useActiveCard("ws-1", null, true), { wrapper })
    expect(api.api.get).not.toHaveBeenCalled()
  })
})
