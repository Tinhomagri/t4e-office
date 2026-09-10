import { QueryClient, type QueryKey } from "@tanstack/react-query"
import { describe, expect, it } from "vitest"

import type { Card, CardStatus } from "@/features/workspace/workspace.types"
import {
  applyCardDrop,
  applyCardDropToQueries,
  calculateCardDrop,
  getDropEdge,
  restoreCardQuerySnapshots,
} from "./kanban.drag"

function card(id: string, status: CardStatus): Card {
  return {
    id,
    ref: `T4-${id}`,
    project_id: "project",
    number: Number(id.replace(/\D/g, "")) || 1,
    title: id,
    description: "",
    status,
    type: "feature",
    priority: "medium",
    points: null,
    assignee_id: null,
    reporter_id: null,
    sprint_id: null,
    start_date: null,
    due_date: null,
    order: 0,
    rank: id,
    parent_id: null,
    epic_id: null,
    epic_color: "",
    labels: [],
    created_at: null,
    updated_at: null,
  }
}

function ids(cards: Card[] | undefined) {
  return cards?.map((item) => `${item.id}:${item.status}`)
}

describe("calculateCardDrop", () => {
  it("move entre colunas antes do card indicado sem aguardar o servidor", () => {
    const cards = [card("1", "todo"), card("2", "doing"), card("3", "doing")]

    const result = calculateCardDrop(cards, "1", "3", "before")

    expect(result).toEqual({
      activeId: "1",
      destination: "doing",
      beforeId: "2",
      afterId: "3",
      moved: true,
    })
    expect(ids(applyCardDrop(cards, result!))).toEqual([
      "2:doing",
      "1:doing",
      "3:doing",
    ])
  })

  it("reordena dentro da mesma coluna depois do alvo", () => {
    const cards = [card("1", "todo"), card("2", "todo"), card("3", "todo")]

    const result = calculateCardDrop(cards, "1", "2", "after")

    expect(result).toMatchObject({ beforeId: "2", afterId: "3", moved: true })
    expect(ids(applyCardDrop(cards, result!))).toEqual([
      "2:todo",
      "1:todo",
      "3:todo",
    ])
  })

  it("coloca no fim de uma coluna quando o alvo é a própria coluna", () => {
    const cards = [card("1", "todo"), card("2", "doing"), card("3", "doing")]

    const result = calculateCardDrop(cards, "1", "doing")

    expect(result).toMatchObject({ destination: "doing", beforeId: "3", afterId: null })
    expect(ids(applyCardDrop(cards, result!))).toEqual([
      "2:doing",
      "3:doing",
      "1:doing",
    ])
  })

  it("move para uma coluna vazia sem vizinhos de rank", () => {
    const cards = [card("1", "todo"), card("2", "doing")]

    const result = calculateCardDrop(cards, "1", "done")

    expect(result).toMatchObject({ destination: "done", beforeId: null, afterId: null })
    expect(ids(applyCardDrop(cards, result!))).toEqual([
      "2:doing",
      "1:done",
    ])
  })
})

describe("applyCardDropToQueries", () => {
  it("atualiza a chave completa usada pelo Kanban e preserva listas sem o card", () => {
    const queryClient = new QueryClient()
    const boardKey: QueryKey = ["cards", "project", undefined, false]
    const jqlKey: QueryKey = ["cards", "project", "status = doing", false]
    const cards = [card("1", "todo"), card("2", "doing")]
    queryClient.setQueryData(boardKey, cards)
    queryClient.setQueryData(jqlKey, [card("2", "doing")])
    const result = calculateCardDrop(cards, "1", "doing")!

    const snapshots = applyCardDropToQueries(queryClient, "project", result)

    expect(ids(queryClient.getQueryData<Card[]>(boardKey))).toEqual([
      "2:doing",
      "1:doing",
    ])
    expect(ids(queryClient.getQueryData<Card[]>(jqlKey))).toEqual(["2:doing"])
    expect(snapshots).toEqual([
      [boardKey, cards],
      [jqlKey, [expect.objectContaining({ id: "2", status: "doing" })]],
    ])
  })

  it("restaura cada variante exata do cache quando a persistência falha", () => {
    const queryClient = new QueryClient()
    const regularKey: QueryKey = ["cards", "project", undefined, false]
    const oldDoneKey: QueryKey = ["cards", "project", undefined, true]
    const regular = [card("1", "todo"), card("2", "doing")]
    const withOldDone = [...regular, card("3", "done")]
    queryClient.setQueryData(regularKey, regular)
    queryClient.setQueryData(oldDoneKey, withOldDone)
    const result = calculateCardDrop(regular, "1", "doing")!
    const snapshots = applyCardDropToQueries(queryClient, "project", result)

    restoreCardQuerySnapshots(queryClient, snapshots)

    expect(queryClient.getQueryData(regularKey)).toEqual(regular)
    expect(queryClient.getQueryData(oldDoneKey)).toEqual(withOldDone)
  })
})

describe("getDropEdge", () => {
  it("indica antes quando o centro do card está acima do centro do alvo", () => {
    expect(getDropEdge({ top: 10, height: 20 }, { top: 20, height: 40 })).toBe("before")
  })

  it("indica depois quando o centro do card passou do centro do alvo", () => {
    expect(getDropEdge({ top: 50, height: 20 }, { top: 20, height: 40 })).toBe("after")
  })
})
