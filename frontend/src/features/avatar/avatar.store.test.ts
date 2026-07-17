import { beforeEach, describe, expect, it } from "vitest"

import { useAvatarStore } from "./avatar.store"
import { DEFAULT_AVATAR } from "./avatar.types"

function reset() {
  useAvatarStore.setState({
    config: { ...DEFAULT_AVATAR },
    created: false,
    history: [{ ...DEFAULT_AVATAR }],
    hIndex: 0,
  })
}

describe("avatar store — histórico undo/redo", () => {
  beforeEach(reset)

  it("set registra passo e undo volta", () => {
    const s = useAvatarStore.getState()
    s.set("hair", 5)
    expect(useAvatarStore.getState().config.hair).toBe(5)
    expect(useAvatarStore.getState().canUndo()).toBe(true)

    useAvatarStore.getState().undo()
    expect(useAvatarStore.getState().config.hair).toBe(DEFAULT_AVATAR.hair)
  })

  it("redo refaz o passo desfeito", () => {
    useAvatarStore.getState().set("skin", 3)
    useAvatarStore.getState().undo()
    expect(useAvatarStore.getState().canRedo()).toBe(true)
    useAvatarStore.getState().redo()
    expect(useAvatarStore.getState().config.skin).toBe(3)
  })

  it("nova mutação após undo trunca o redo pendente", () => {
    const s = useAvatarStore.getState()
    s.set("hair", 1)
    s.set("hair", 2)
    s.set("hair", 3)
    useAvatarStore.getState().undo()
    useAvatarStore.getState().undo() // hair=1
    useAvatarStore.getState().set("skin", 4) // trunca hair=2 e hair=3
    expect(useAvatarStore.getState().canRedo()).toBe(false)
    useAvatarStore.getState().redo() // no-op
    expect(useAvatarStore.getState().config.skin).toBe(4)
    expect(useAvatarStore.getState().config.hair).toBe(1)
  })

  it("histórico limitado a 30 entradas", () => {
    for (let i = 0; i < 60; i++) {
      useAvatarStore.getState().set("hair", i % 10)
    }
    expect(useAvatarStore.getState().history.length).toBeLessThanOrEqual(30)
  })

  it("setTransient não registra histórico; commit registra", () => {
    useAvatarStore.getState().setTransient("hair", 7)
    expect(useAvatarStore.getState().canUndo()).toBe(false)
    useAvatarStore.getState().commit()
    expect(useAvatarStore.getState().canUndo()).toBe(true)
    useAvatarStore.getState().undo()
    expect(useAvatarStore.getState().config.hair).toBe(DEFAULT_AVATAR.hair)
  })

  it("randomize com seed é um único passo de histórico", () => {
    useAvatarStore.getState().randomize(42)
    const after = useAvatarStore.getState()
    expect(after.hIndex).toBe(1)
    after.undo()
    expect(useAvatarStore.getState().config).toEqual(DEFAULT_AVATAR)
  })

  it("undo em índice 0 é no-op", () => {
    useAvatarStore.getState().undo()
    expect(useAvatarStore.getState().config).toEqual(DEFAULT_AVATAR)
    expect(useAvatarStore.getState().hIndex).toBe(0)
  })
})
