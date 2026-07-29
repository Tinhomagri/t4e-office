import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import { createElement as h, type ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"

import * as desksApi from "./desks.api"
import { useAssignDesk, useDeskAssignments } from "./desks.hooks"

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return h(QueryClientProvider, { client: qc }, children)
}

describe("useDeskAssignments", () => {
  it("busca a lista pro workspace/andar dados", async () => {
    vi.spyOn(desksApi, "listDeskAssignments").mockResolvedValue([
      { seat_id: "ws-9-4", floor: 1, user_id: "u1", user_name: "Ana" },
    ])
    const { result } = renderHook(() => useDeskAssignments("ws1", 1), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toHaveLength(1)
    expect(desksApi.listDeskAssignments).toHaveBeenCalledWith("ws1", 1)
  })

  it("não busca sem workspaceId", () => {
    const spy = vi.spyOn(desksApi, "listDeskAssignments")
    renderHook(() => useDeskAssignments(null, 1), { wrapper })
    expect(spy).not.toHaveBeenCalled()
  })
})

describe("useAssignDesk", () => {
  it("chama assignDesk com os campos certos", async () => {
    vi.spyOn(desksApi, "assignDesk").mockResolvedValue([])
    const { result } = renderHook(() => useAssignDesk("ws1", 1), { wrapper })
    result.current.mutate({ seatId: "ws-9-4", userId: "u1" })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(desksApi.assignDesk).toHaveBeenCalledWith({
      workspaceId: "ws1",
      floor: 1,
      seatId: "ws-9-4",
      userId: "u1",
    })
  })
})
