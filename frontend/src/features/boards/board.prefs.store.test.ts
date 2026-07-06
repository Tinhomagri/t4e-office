import { beforeEach, describe, expect, it } from "vitest"
import { colKey, useBoardPrefs } from "./board.prefs.store"

describe("colKey", () => {
  it("compõe a chave projeto:status", () => {
    expect(colKey("proj-1", "doing")).toBe("proj-1:doing")
  })
})

describe("useBoardPrefs", () => {
  beforeEach(() => {
    useBoardPrefs.setState({ wipLimits: {}, collapsed: {}, swimlanes: {} })
  })

  it("define e remove WIP limit (limite <= 0 apaga a chave)", () => {
    const key = colKey("p", "todo")
    useBoardPrefs.getState().setWip(key, 3)
    expect(useBoardPrefs.getState().wipLimits[key]).toBe(3)

    useBoardPrefs.getState().setWip(key, 0)
    expect(useBoardPrefs.getState().wipLimits[key]).toBeUndefined()
  })

  it("alterna o colapso da coluna", () => {
    const key = colKey("p", "done")
    useBoardPrefs.getState().toggleCollapse(key)
    expect(useBoardPrefs.getState().collapsed[key]).toBe(true)
    useBoardPrefs.getState().toggleCollapse(key)
    expect(useBoardPrefs.getState().collapsed[key]).toBe(false)
  })

  it("guarda o modo de swimlane por projeto", () => {
    useBoardPrefs.getState().setSwimlane("p", "assignee")
    expect(useBoardPrefs.getState().swimlanes["p"]).toBe("assignee")
  })
})
