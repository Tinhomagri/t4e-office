import { beforeEach, describe, expect, it } from "vitest"

import { usePokerRoomStore } from "./pokerRoom.store"

const reset = () => usePokerRoomStore.setState({ consoleOpen: false, voteSeatId: null })

describe("usePokerRoomStore", () => {
  beforeEach(reset)

  it("começa fechado", () => {
    expect(usePokerRoomStore.getState()).toMatchObject({ consoleOpen: false, voteSeatId: null })
  })

  it("abre e fecha o console", () => {
    usePokerRoomStore.getState().openConsole()
    expect(usePokerRoomStore.getState().consoleOpen).toBe(true)
    usePokerRoomStore.getState().closeConsole()
    expect(usePokerRoomStore.getState().consoleOpen).toBe(false)
  })

  it("abre o voto guardando o id do assento e fecha limpando", () => {
    usePokerRoomStore.getState().openVote("pk-6-13")
    expect(usePokerRoomStore.getState().voteSeatId).toBe("pk-6-13")
    usePokerRoomStore.getState().closeVote()
    expect(usePokerRoomStore.getState().voteSeatId).toBeNull()
  })

  it("abrir o console não mexe no voto, e vice-versa", () => {
    usePokerRoomStore.getState().openVote("pk-6-13")
    usePokerRoomStore.getState().openConsole()
    expect(usePokerRoomStore.getState().voteSeatId).toBe("pk-6-13")
    expect(usePokerRoomStore.getState().consoleOpen).toBe(true)
  })
})
