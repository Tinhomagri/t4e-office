import { describe, expect, it } from "vitest"

import { pickActiveSession } from "./poker.selectors"
import type { PokerSession } from "./poker.types"

function session(status: PokerSession["status"], id = "s1"): PokerSession {
  return {
    id, workspace_id: "w1", project_id: "p1", created_by: "u1",
    name: "Sessão", status, current_card_id: null, card_ids: [],
    created_at: "2026-01-01T00:00:00Z", participants: [], votes: [],
  }
}

describe("pickActiveSession", () => {
  it("prefere sessão em votação sobre qualquer outra", () => {
    const sessions = [session("done", "a"), session("voting", "b"), session("waiting", "c")]
    expect(pickActiveSession(sessions)?.id).toBe("b")
  })

  it("prefere revelado sobre aguardando", () => {
    const sessions = [session("waiting", "a"), session("revealed", "b")]
    expect(pickActiveSession(sessions)?.id).toBe("b")
  })

  it("cai para 'aguardando' se não há votação nem reveal em curso", () => {
    const sessions = [session("done", "a"), session("waiting", "b")]
    expect(pickActiveSession(sessions)?.id).toBe("b")
  })

  it("devolve null se só há sessões concluídas ou lista vazia", () => {
    expect(pickActiveSession([session("done")])).toBeNull()
    expect(pickActiveSession([])).toBeNull()
  })
})
