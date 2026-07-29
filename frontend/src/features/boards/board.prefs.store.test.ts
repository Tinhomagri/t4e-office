import { beforeEach, describe, expect, it } from "vitest"
import { colKey, useBoardPrefs } from "./board.prefs.store"

describe("colKey", () => {
  it("compõe a chave projeto:status", () => {
    expect(colKey("proj-1", "doing")).toBe("proj-1:doing")
  })
})

describe("useBoardPrefs", () => {
  beforeEach(() => {
    useBoardPrefs.setState({ collapsed: {} })
  })

  it("alterna o colapso da coluna", () => {
    const key = colKey("p", "done")
    useBoardPrefs.getState().toggleCollapse(key)
    expect(useBoardPrefs.getState().collapsed[key]).toBe(true)
    useBoardPrefs.getState().toggleCollapse(key)
    expect(useBoardPrefs.getState().collapsed[key]).toBe(false)
  })

  it("mantém colapsos de colunas diferentes independentes", () => {
    const todo = colKey("p", "todo")
    const done = colKey("p", "done")
    useBoardPrefs.getState().toggleCollapse(todo)
    expect(useBoardPrefs.getState().collapsed[todo]).toBe(true)
    expect(useBoardPrefs.getState().collapsed[done]).toBeUndefined()
  })
})
